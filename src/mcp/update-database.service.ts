import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { isAxiosError } from 'axios';
import { UpdateDatabaseArgsDto } from './dto/tool-args.dto';
import { AnthropicService } from 'src/ai/anthropic.service';

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };

interface SchemaColumn {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
}

type SchemaMap = Map<string, Set<string>>; // table_name → Set<column_name>

@Injectable()
export class UpdateDatabaseService {
  private readonly logger = new Logger(UpdateDatabaseService.name);

  private readonly BLOCKED_TABLES = new Set([
    'users', 'clients', 'properties', 'land_tax_rates',
    'package_documents', 'client_approval_token',
  ]);

  private schemaCache: { schema: string; map: SchemaMap; expiresAt: number } | null = null;
  private readonly SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly anthropic: AnthropicService,
  ) {}

  private async fetchLiveSchema(): Promise<{ schema: string; map: SchemaMap }> {
    if (this.schemaCache && Date.now() < this.schemaCache.expiresAt) {
      return { schema: this.schemaCache.schema, map: this.schemaCache.map };
    }

    const rows: SchemaColumn[] = await this.dataSource.query(`
      SELECT t.table_name, c.column_name, c.data_type, c.is_nullable
      FROM information_schema.tables t
      JOIN information_schema.columns c
        ON c.table_schema = t.table_schema AND c.table_name = t.table_name
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name, c.ordinal_position
    `);

    const grouped = new Map<string, SchemaColumn[]>();
    for (const row of rows) {
      if (!grouped.has(row.table_name)) grouped.set(row.table_name, []);
      grouped.get(row.table_name)!.push(row);
    }

    const schemaMap: SchemaMap = new Map();
    const lines: string[] = [];

    for (const [table, columns] of grouped) {
      const blocked = this.BLOCKED_TABLES.has(table) ? ' [PROTECTED — writes not allowed]' : '';
      lines.push(`TABLE: ${table}${blocked}`);
      const colNames = new Set<string>();
      for (const col of columns) {
        const nullable = col.is_nullable === 'YES' ? 'nullable' : 'NOT NULL';
        lines.push(`  ${col.column_name} (${col.data_type}, ${nullable})`);
        colNames.add(col.column_name);
      }
      schemaMap.set(table, colNames);
      lines.push('');
    }

    const schema = lines.join('\n');
    this.schemaCache = { schema, map: schemaMap, expiresAt: Date.now() + this.SCHEMA_CACHE_TTL_MS };
    return { schema, map: schemaMap };
  }

  async execute(
    args: Record<string, unknown>,
    skillContent: string,
    correlationId: string,
  ): Promise<ToolResult> {
    const timestamp = new Date().toISOString();

    // 1. Validate DTO
    const dto = plainToInstance(UpdateDatabaseArgsDto, args);
    try {
      await validateOrReject(dto);
    } catch (errors) {
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: false, reason: 'Invalid arguments', details: String(errors), timestamp,
        }) }],
        isError: true,
      };
    }

    // 2. Fetch live schema from information_schema
    let liveSchema: string;
    let schemaMap: SchemaMap;
    try {
      ({ schema: liveSchema, map: schemaMap } = await this.fetchLiveSchema());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: false, reason: `Failed to fetch database schema: ${message}`, timestamp,
        }) }],
        isError: true,
      };
    }

    // 3. Call Claude with reasoning mode — inject live schema into user message
    let parsed: { table: string; record_id: string; updates: Record<string, unknown>; performed_by: string };
    try {
      const result = await this.anthropic.call({
        systemBlocks: [{ text: skillContent }],
        userMessage: [
          dto.instruction,
          '',
          'DATABASE SCHEMA (live — use these exact column names, do not invent any):',
          liveSchema,
          'RULES:',
          '- Only use column names that appear in the schema above.',
          '- If the column you need is not listed, return { "success": false, "reason": "Column not found in schema" }.',
          '- Tables marked [PROTECTED] must not be written to.',
          '- record_id and performed_by must be UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).',
          '- If any identifier is not a UUID, return { "success": false, "reason": "Non-UUID identifier provided" }.',
          '',
          'Return a single raw JSON object — no prose, no markdown fences.',
          'Fields: table, record_id, updates (object with column→value pairs), performed_by.',
        ].join('\n'),
        maxTokens: 4000,
        thinking: { budgetTokens: 2000 },
      });
      parsed = this.anthropic.parseJsonObject<typeof parsed>(result.text);
    } catch (err) {
      const message = isAxiosError(err)
        ? `Anthropic API ${err.response?.status}: ${err.message}`
        : err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: false, reason: `Claude reasoning failed: ${message}`, timestamp,
        }) }],
        isError: true,
      };
    }

    // 4. Validate Claude output — if Claude returned a failure object, pass it through directly
    const raw = parsed as Record<string, unknown>;
    if (raw['success'] === false) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ ...raw, timestamp }) }],
        isError: true,
      };
    }
    const { table, record_id, updates, performed_by } = parsed;
    if (!table || !record_id || !performed_by || !updates || !Object.keys(updates).length) {
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: false, reason: 'Claude returned incomplete data.', timestamp,
        }) }],
        isError: true,
      };
    }

    // 5. Blocked table guard
    if (this.BLOCKED_TABLES.has(table)) {
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: false, table, record_id,
          reason: `Table '${table}' is protected — AI writes are not permitted.`,
          action_required: 'manual_review', timestamp,
        }) }],
        isError: true,
      };
    }

    // 6. Validate that every column Claude chose actually exists in the live schema
    const knownColumns = schemaMap.get(table);
    if (!knownColumns) {
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: false, table, record_id,
          reason: `Table '${table}' does not exist in the database.`,
          action_required: 'manual_review', timestamp,
        }) }],
        isError: true,
      };
    }
    for (const col of Object.keys(updates)) {
      if (!knownColumns.has(col)) {
        this.schemaCache = null; // bust cache in case schema changed since last fetch
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: false, table, record_id,
            reason: `Column '${col}' does not exist in table '${table}'.`,
            action_required: 'manual_review', timestamp,
          }) }],
          isError: true,
        };
      }
    }

    // 7. Confirm row exists (read-only pre-flight check)
    let exists: { id: string }[];
    try {
      exists = await this.dataSource.query(
        `SELECT id FROM "${table}" WHERE id = $1 LIMIT 1`,
        [record_id],
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: false, table, record_id,
          reason: `Pre-flight query failed: ${message}`, action_required: 'manual_review', timestamp,
        }) }],
        isError: true,
      };
    }
    if (!exists.length) {
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: false, table, record_id,
          reason: 'Record not found', action_required: 'manual_review', timestamp,
        }) }],
        isError: true,
      };
    }

    // 8. Read previous values + execute UPDATE inside a single transaction
    const columns = Object.keys(updates);
    const values  = Object.values(updates);
    const colList = columns.map((c) => `"${c}"`).join(', ');
    const setClauses = columns.map((col, i) => `"${col}" = $${i + 1}`).join(', ');
    const updateSql  = `UPDATE "${table}" SET ${setClauses} WHERE id = $${columns.length + 1}`;
    const params     = [...values, record_id];

    let previousValues: Record<string, unknown> = {};
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const prevRows: Record<string, unknown>[] = await queryRunner.query(
        `SELECT ${colList} FROM "${table}" WHERE id = $1`,
        [record_id],
      );
      previousValues = prevRows[0] ?? {};
      await queryRunner.query(updateSql, params);
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: false, table, record_id,
          reason: message, action_required: 'manual_review', timestamp,
        }) }],
        isError: true,
      };
    } finally {
      await queryRunner.release();
    }

    this.logger.log(JSON.stringify({
      context: 'MCP.db.write',
      correlationId, tool: 'update_database',
      table, record_id, columns, performed_by,
      ts: timestamp,
    }));

    // 9. Return write-back output schema (update-database.md §B.5)
    return {
      content: [{ type: 'text', text: JSON.stringify({
        success: true, table, record_id,
        fields_updated: columns,
        previous_values: previousValues,
        new_values: updates,
        audit_logged: false,
        timestamp,
      }) }],
    };
  }
}
