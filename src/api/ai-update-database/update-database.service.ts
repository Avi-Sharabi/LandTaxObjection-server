import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { isAxiosError } from 'axios';
import { UpdateDatabaseArgsDto } from '../../mcp/dto/tool-args.dto';
import { AnthropicService } from 'src/ai/anthropic.service';
import { SkillRegistryService } from '../../mcp/skill-registry.service';

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

  private schemaCache: { schema: string; map: SchemaMap; expiresAt: number } | null = null;
  private readonly SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly anthropic: AnthropicService,
    private readonly config: ConfigService,
    private readonly skillRegistry: SkillRegistryService,
  ) {}

  async chat(instruction: string): Promise<object> {
    const skillContent = this.skillRegistry.getSkillContent('update-database');
    const result = await this.execute({ instruction }, skillContent, randomUUID());
    try {
      return JSON.parse(result.content[0]?.text ?? '{}') as object;
    } catch {
      return { success: false, reason: 'AI returned an unparseable response' };
    }
  }

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
      lines.push(`TABLE: ${table}`);
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
    performedBy?: string,
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

    // 3a. Ask Claude to generate a SELECT query
    let matchedRows: unknown[] = [];
    try {
      const searchResult = await this.anthropic.call({
        systemBlocks: [{ text: skillContent }],
        userMessage: [
          'INSTRUCTION: ' + dto.instruction,
          '',
          'DATABASE TABLES (search within these):',
          liveSchema,
          '',
          'Write a single SQL SELECT query that finds the record(s) matching the details in the instruction.',
          'Return ONLY the raw SQL — no prose, no markdown fences, no explanation.',
        ].join('\n'),
        maxTokens: 500,
      });

      const sql = searchResult.text.trim().replace(/;$/, '').replace(/```(?:sql)?/gi, '').trim();
      const normalized = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '').trim().toUpperCase();
      if (normalized.startsWith('SELECT') || normalized.startsWith('WITH')) {
        matchedRows = await this.dataSource.query(`SELECT * FROM (${sql}) _search_q LIMIT 10`);
      }
    } catch {
      // non-fatal — proceed with empty context
    }

    // 3b. Call Claude with the found rows — it decides the exact update
    let parsed: { table: string; record_id: string; updates: Record<string, unknown> };
    try {
      const result = await this.anthropic.call({
        systemBlocks: [{ text: skillContent }],
        userMessage: [
          'INSTRUCTION FROM USER:',
          dto.instruction,
          '',
          'DATABASE SCHEMA (live — use these exact column names):',
          liveSchema,
          '',
          'MATCHING RECORDS FOUND IN DATABASE:',
          matchedRows.length ? JSON.stringify(matchedRows, null, 2) : '(none found)',
          '',
          'RULES:',
          '- Use only the record(s) above — do not invent IDs.',
          '- Only use column names that appear in the schema above.',
          '- If no record was found or the match is ambiguous, return { "success": false, "reason": "<explanation>" }.',
          '',
          'Return a single raw JSON object — no prose, no markdown fences.',
          'Fields: table, record_id (UUID from the matched record), updates (column→value pairs).',
        ].join('\n'),
        maxTokens: 4000,
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

    // 4. Validate Claude output — pass through Claude failure objects directly
    const raw = parsed as Record<string, unknown>;
    if (raw['success'] === false) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ ...raw, timestamp }) }],
        isError: true,
      };
    }
    const { table, record_id, updates } = parsed;
    if (!table || !record_id || !updates || !Object.keys(updates).length) {
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: false, reason: 'Claude returned incomplete data.', timestamp,
        }) }],
        isError: true,
      };
    }

    // 5. Validate that every column Claude chose actually exists in the live schema
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

    // 7. Pre-flight: confirm record exists
    let currentRow: Record<string, unknown>[];
    try {
      currentRow = await this.dataSource.query(
        `SELECT "id" FROM "${table}" WHERE id = $1 LIMIT 1`,
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
    if (!currentRow.length) {
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: false, table, record_id,
          reason: 'Record not found', action_required: 'manual_review', timestamp,
        }) }],
        isError: true,
      };
    }

    // 8. Build parameterized UPDATE SQL
    const columns = Object.keys(updates);
    const params: unknown[] = [];
    const setClauses: string[] = [];

    for (const col of columns) {
      params.push(updates[col]);
      setClauses.push(`"${col}" = $${params.length}`);
    }

    params.push(record_id);
    const updateSql = `UPDATE "${table}" SET ${setClauses.join(', ')} WHERE id = $${params.length}`;

    const performedByValue =
      performedBy ??
      this.config.get<string>('MCP_SYSTEM_USER_NAME') ??
      'AI System';
    const colList = columns.map((c) => `"${c}"`).join(', ');

    // 9. Execute UPDATE in a transaction
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

    // Best-effort audit log — never fails the main write
    let auditLogged = false;
    try {
      const actionDetail = JSON.stringify({ table, previous_values: previousValues, new_values: updates });
      await this.dataSource.query(
        `INSERT INTO "ai_update_logs" ("id", "action", "record_id", "performed_by", "created_at")
         VALUES (uuid_generate_v4(), $1, $2, $3, NOW())`,
        [actionDetail, record_id, performedByValue],
      );
      auditLogged = true;
    } catch {
      // table may not exist — log but do not fail
      this.logger.warn(`audit log skipped for ${table}/${record_id} — ai_update_logs unavailable`);
    }

    this.logger.log(JSON.stringify({
      context: 'MCP.db.write',
      correlationId, tool: 'update_database',
      table, record_id, columns, performed_by: performedByValue,
      ts: timestamp,
    }));

    // 10. Return write-back output schema
    return {
      content: [{ type: 'text', text: JSON.stringify({
        success: true, table, record_id,
        fields_updated: columns,
        previous_values: previousValues,
        new_values: updates,
        audit_logged: auditLogged,
        timestamp,
      }) }],
    };
  }
}
