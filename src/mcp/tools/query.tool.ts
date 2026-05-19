import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { QueryArgsDto } from '../dto/tool-args.dto';
import { IMcpTool, ToolResult } from './mcp-tool.interface';

@Injectable()
export class QueryTool implements IMcpTool {
  readonly name = 'query';
  readonly description =
    'READ ONLY — executes a SELECT-only SQL query against the database. Rejects non-SELECT statements. Returns at most 500 rows. No writes or DDL permitted.';
  readonly timeoutMs = 10_000;
  readonly inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: { sql: { type: 'string', description: 'A SQL SELECT or WITH query' } },
    required: ['sql'],
  };

  private readonly logger = new Logger(QueryTool.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(args: Record<string, unknown>, correlationId: string): Promise<ToolResult> {
    const dto = plainToInstance(QueryArgsDto, args);
    try {
      await validateOrReject(dto);
    } catch {
      return { content: [{ type: 'text', text: 'sql is required and must be a string' }], isError: true };
    }

    const normalized = dto.sql
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--[^\n]*/g, '')
      .trim()
      .toUpperCase();
    if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH')) {
      return { content: [{ type: 'text', text: 'Only SELECT queries are allowed' }], isError: true };
    }

    const capped = `SELECT * FROM (${dto.sql.trim().replace(/;$/, '')}) _mcp_q LIMIT 500`;
    const t = Date.now();
    const rows = await this.dataSource.query(capped);
    this.logger.log(JSON.stringify({ context: 'MCP.db.query', correlationId, tool: this.name, durationMs: Date.now() - t, rowCount: rows.length }));
    return { content: [{ type: 'text', text: JSON.stringify(rows) }] };
  }
}
