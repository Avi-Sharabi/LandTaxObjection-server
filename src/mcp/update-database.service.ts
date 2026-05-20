import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
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

const AI_ALLOWED_STATUSES = new Set(['vg_approved', 'vg_declined', 'for_review']);
const REQUIRED_CURRENT_STATUS_FOR_AI = 'vg_response_received';

@Injectable()
export class UpdateDatabaseService {
  private readonly logger = new Logger(UpdateDatabaseService.name);

  // Tables the AI is never allowed to write to
  private readonly BLOCKED_TABLES = new Set([
    // Core reference data
    'clients', 'properties',
    // Dispute workflow tables — human-managed only
    'dispute_cases', 'valuation_notices', 'notifications',
    // Auto-generated / system-managed
    'package_documents', 'ai_update_logs', 'comparable_sales',
    // File upload managed tables
    'valuation_notice_files', 'constraint_files', 'dispute_documents', 'assessment_documents',
    // User-action only tables
    'dispute_legal_grounds', 'dispute_constraints',
  ]);

  // Explicit per-table allowlist of columns the AI may write
  private readonly ALLOWED_WRITES: Record<string, Set<string>> = {
    users: new Set(['full_name', 'role', 'phone', 'is_active']),
    land_tax_rates: new Set([
      'tax_year', 'threshold', 'base_amount', 'marginal_rate_pct',
      'premium_threshold', 'premium_base_amount', 'premium_rate_pct', 'foreign_surcharge_pct',
    ]),
  };

  // These fields must be appended to, never overwritten
  private readonly APPEND_ONLY_FIELDS = new Set<string>();

  // Tables with an updated_at column that must be refreshed on raw SQL writes
  private readonly TABLES_WITH_UPDATED_AT = new Set<string>();

  // All AI-writable tables require an ai_update_logs entry
  private readonly AUDIT_REQUIRED_TABLES = new Set(['users', 'land_tax_rates']);

  private schemaCache: { schema: string; map: SchemaMap; expiresAt: number } | null = null;
  private readonly SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly anthropic: AnthropicService,
    private readonly config: ConfigService,
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

    // 3a. Ask Claude to generate a SELECT query to find the matching record
    let matchedRows: unknown[] = [];
    try {
      const searchResult = await this.anthropic.call({
        systemBlocks: [{ text: skillContent }],
        userMessage: [
          'INSTRUCTION: ' + dto.instruction,
          '',
          'DATABASE SCHEMA:',
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
          '- Tables marked [PROTECTED] must not be written to.',
          '- If no record was found or the match is ambiguous, return { "success": false, "reason": "<explanation>" }.',
          '',
          'Return a single raw JSON object — no prose, no markdown fences.',
          'Fields: table, record_id (UUID from the matched record), updates (column→value pairs).',
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

    // 5b. Column-level allowlist — only permitted columns per table may be written
    const allowedColumns = this.ALLOWED_WRITES[table];
    if (!allowedColumns) {
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: false, table, record_id,
          reason: `Table '${table}' is not in the AI write allowlist.`,
          action_required: 'manual_review', timestamp,
        }) }],
        isError: true,
      };
    }
    for (const col of Object.keys(updates)) {
      if (!allowedColumns.has(col)) {
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: false, table, record_id,
            reason: `Column '${col}' on table '${table}' is not permitted for AI writes.`,
            action_required: 'manual_review', timestamp,
          }) }],
          isError: true,
        };
      }
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

    // 7. Pre-flight: confirm record exists and read current status for transition guard
    let currentRow: Record<string, unknown>[];
    try {
      const extraCols = table === 'dispute_cases' ? ', "status"' : '';
      currentRow = await this.dataSource.query(
        `SELECT "id"${extraCols} FROM "${table}" WHERE id = $1 LIMIT 1`,
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

    // 7b. Status transition guard — AI may only move dispute_cases to specific statuses
    //     and only when the current status is vg_response_received
    if (table === 'dispute_cases' && 'status' in updates) {
      const currentStatus = currentRow[0]['status'] as string;
      const newStatus = updates['status'] as string;
      if (currentStatus !== REQUIRED_CURRENT_STATUS_FOR_AI) {
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: false, table, record_id,
            reason: `Status transition not allowed: current status is '${currentStatus}', must be '${REQUIRED_CURRENT_STATUS_FOR_AI}' for AI to update.`,
            action_required: 'manual_review', timestamp,
          }) }],
          isError: true,
        };
      }
      if (!AI_ALLOWED_STATUSES.has(newStatus)) {
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: false, table, record_id,
            reason: `AI may not set status to '${newStatus}'. Allowed values: ${[...AI_ALLOWED_STATUSES].join(', ')}.`,
            action_required: 'manual_review', timestamp,
          }) }],
          isError: true,
        };
      }
    }

    // 8. Build parameterized UPDATE SQL
    //    Append-only fields use CASE … COALESCE to concatenate rather than overwrite.
    //    updated_at is injected via NOW() for tables that track it.
    const columns = Object.keys(updates);
    const params: unknown[] = [];
    const setClauses: string[] = [];

    for (const col of columns) {
      params.push(updates[col]);
      if (this.APPEND_ONLY_FIELDS.has(col)) {
        setClauses.push(
          `"${col}" = CASE WHEN "${col}" IS NULL THEN $${params.length} ELSE "${col}" || E'\\n' || $${params.length} END`,
        );
      } else {
        setClauses.push(`"${col}" = $${params.length}`);
      }
    }

    if (this.TABLES_WITH_UPDATED_AT.has(table)) {
      setClauses.push(`"updated_at" = NOW()`);
    }

    params.push(record_id);
    const updateSql = `UPDATE "${table}" SET ${setClauses.join(', ')} WHERE id = $${params.length}`;


    const performedByValue =
      performedBy ??
      this.config.get<string>('MCP_SYSTEM_USER_NAME') ??
      'AI System';
    const colList = columns.map((c) => `"${c}"`).join(', ');

    // 9. Execute UPDATE + audit log insert in a single transaction
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

      if (this.AUDIT_REQUIRED_TABLES.has(table)) {
        const actionDetail = JSON.stringify({
          table,
          previous_values: previousValues,
          new_values: updates,
        });
        await queryRunner.query(
          `INSERT INTO "ai_update_logs" ("id", "action", "record_id", "performed_by", "created_at")
           VALUES (uuid_generate_v4(), $1, $2, $3, NOW())`,
          [actionDetail, record_id, performedByValue],
        );
      }

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
      table, record_id, columns, performed_by: performedByValue,
      ts: timestamp,
    }));

    // 10. Return write-back output schema (update-database.md §B.5)
    return {
      content: [{ type: 'text', text: JSON.stringify({
        success: true, table, record_id,
        fields_updated: columns,
        previous_values: previousValues,
        new_values: updates,
        audit_logged: this.AUDIT_REQUIRED_TABLES.has(table),
        timestamp,
      }) }],
    };
  }
}
