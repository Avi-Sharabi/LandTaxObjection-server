import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IMcpTool, ToolResult } from './mcp-tool.interface';
import { CacheEntry } from './cache-entry.type';

const CACHE_KEY = 'list_tables';
const TTL_MS = 5 * 60 * 1000;

@Injectable()
export class ListTablesTool implements IMcpTool {
  readonly name = 'list_tables';
  readonly description =
    'READ ONLY — lists all tables in the public PostgreSQL schema with row estimates from pg_stat_user_tables. No writes.';
  readonly timeoutMs = 10_000;
  readonly inputSchema = { type: 'object', additionalProperties: false, properties: {} };

  private readonly logger = new Logger(ListTablesTool.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(_args: Record<string, unknown>, correlationId: string): Promise<ToolResult> {
    const cached = this.getCached<ToolResult>(CACHE_KEY);
    if (cached) {
      this.logger.log(JSON.stringify({ context: 'MCP.cache.hit', correlationId, tool: this.name }));
      return cached;
    }

    const t = Date.now();
    const rows = await this.dataSource.query(`
      SELECT t.table_name, COALESCE(s.n_live_tup, 0)::int AS row_estimate
      FROM information_schema.tables t
      LEFT JOIN pg_stat_user_tables s ON s.relname = t.table_name
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `);
    this.logger.log(JSON.stringify({ context: 'MCP.db.query', correlationId, tool: this.name, durationMs: Date.now() - t, rowCount: rows.length }));

    const result: ToolResult = { content: [{ type: 'text', text: JSON.stringify(rows) }] };
    this.cache.set(CACHE_KEY, { data: result, expiresAt: Date.now() + TTL_MS });
    return result;
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiresAt) { this.cache.delete(key); return null; }
    return entry.data as T;
  }
}
