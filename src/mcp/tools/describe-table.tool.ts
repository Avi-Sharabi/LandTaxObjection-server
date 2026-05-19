import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { DescribeTableArgsDto } from '../dto/tool-args.dto';
import { IMcpTool, ToolResult } from './mcp-tool.interface';
import { CacheEntry } from './cache-entry.type';

const TTL_MS = 5 * 60 * 1000;

@Injectable()
export class DescribeTableTool implements IMcpTool {
  readonly name = 'describe_table';
  readonly description =
    'READ ONLY — returns column definitions for a named table from information_schema.columns. No writes.';
  readonly timeoutMs = 10_000;
  readonly inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: { table_name: { type: 'string', description: 'Table name to describe' } },
    required: ['table_name'],
  };

  private readonly logger = new Logger(DescribeTableTool.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(args: Record<string, unknown>, correlationId: string): Promise<ToolResult> {
    const dto = plainToInstance(DescribeTableArgsDto, args);
    try {
      await validateOrReject(dto);
    } catch {
      return { content: [{ type: 'text', text: 'table_name is required and must be a string' }], isError: true };
    }

    const cacheKey = `describe_table:${dto.table_name}`;
    const cached = this.getCached<ToolResult>(cacheKey);
    if (cached) {
      this.logger.log(JSON.stringify({ context: 'MCP.cache.hit', correlationId, tool: this.name, tableName: dto.table_name }));
      return cached;
    }

    const t = Date.now();
    const rows = await this.dataSource.query(
      `SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [dto.table_name],
    );
    this.logger.log(JSON.stringify({ context: 'MCP.db.query', correlationId, tool: this.name, tableName: dto.table_name, durationMs: Date.now() - t }));

    const result: ToolResult = { content: [{ type: 'text', text: JSON.stringify(rows) }] };
    this.cache.set(cacheKey, { data: result, expiresAt: Date.now() + TTL_MS });
    return result;
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiresAt) { this.cache.delete(key); return null; }
    return entry.data as T;
  }
}
