import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { Server } from '@modelcontextprotocol/sdk/server';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Request, Response } from 'express';
import {
  DescribeTableArgsDto,
  QueryArgsDto,
  SearchComparableSalesArgsDto,
} from './dto/tool-args.dto';

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };
type CacheEntry = { data: unknown; expiresAt: number };

@Injectable()
export class McpService implements OnModuleInit {
  private readonly logger = new Logger(McpService.name);
  private readonly toolCache = new Map<string, CacheEntry>();
  private readonly skills = new Map<string, string>();

  constructor(@InjectDataSource() private dataSource: DataSource) {}

  onModuleInit(): void {
    const skillsDir = path.join(process.cwd(), 'src', 'skills');
    if (!fs.existsSync(skillsDir)) return;
    for (const file of fs.readdirSync(skillsDir)) {
      if (!file.endsWith('.md')) continue;
      const name = file.replace(/\.md$/, '');
      const content = fs.readFileSync(path.join(skillsDir, file), 'utf-8');
      this.skills.set(name, content);
      this.logEvent('MCP.skills.loaded', { skill: name, length: content.length });
    }
  }

  getSkillContent(name: string): string {
    const content = this.skills.get(name);
    if (!content) throw new Error(`Skill '${name}' not found. Available: ${[...this.skills.keys()].join(', ')}`);
    return content;
  }

  private logEvent(context: string, data: Record<string, unknown>): void {
    this.logger.log(JSON.stringify({ context, ...data, ts: new Date().toISOString() }));
  }

  private getCached<T>(key: string): T | null {
    const entry = this.toolCache.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      this.toolCache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setCached(key: string, data: unknown, ttlMs: number): void {
    this.toolCache.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  private withTimeout<T>(p: Promise<T>, ms: number, tool: string): Promise<T> {
    return Promise.race([
      p,
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error(`Tool '${tool}' timed out after ${ms}ms`)), ms),
      ),
    ]);
  }

  async handleRequest(req: Request, res: Response): Promise<void> {
    const correlationId = (req as Request & { correlationId?: string }).correlationId ?? randomUUID();
    const start = Date.now();
    this.logEvent('MCP.request', { correlationId, method: req.method, ip: req.ip, body: req.body });

    const server = new Server(
      { name: 'landtaxdispute-postgres', version: '1.0.0' },
      { capabilities: { tools: {}, resources: {} } },
    );

    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [...this.skills.entries()].map(([name]) => ({
        uri: `skill://${name}`,
        name,
        description: `Domain skill: ${name.replace(/-/g, ' ')}`,
        mimeType: 'text/markdown',
      })),
    }));

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const name = request.params.uri.replace('skill://', '');
      const content = this.skills.get(name);
      if (!content) throw new Error(`Resource not found: ${request.params.uri}`);
      return {
        contents: [{ uri: request.params.uri, mimeType: 'text/markdown', text: content }],
      };
    });

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logEvent('MCP.tools/list', { correlationId });
      return {
        tools: [
          {
            name: 'search_comparable_sales',
            description:
              'READ ONLY — queries property_sales_raw with parameterized filters. No writes. Prefer this over the raw query tool for comparable sales lookups.',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                suburb:       { type: 'string', description: 'property_locality value to filter by' },
                zoning:       { type: 'string', description: 'Zoning code to filter by (e.g. E4, R2)' },
                date_from:    { type: 'string', description: 'Contract date from, YYYY-MM-DD' },
                date_to:      { type: 'string', description: 'Contract date to, YYYY-MM-DD' },
                area_min_sqm: { type: 'number', description: 'Minimum land area in m² (areas < 100 in the table are in ha)' },
                area_max_sqm: { type: 'number', description: 'Maximum land area in m² (areas < 100 in the table are in ha)' },
                limit:        { type: 'number', description: 'Max rows to return (default 50, max 200)' },
              },
            },
          },
          {
            name: 'query',
            description:
              'READ ONLY — executes a SELECT-only SQL query against the database. Rejects non-SELECT statements. Returns at most 500 rows. No writes or DDL permitted.',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: { sql: { type: 'string', description: 'A SQL SELECT or WITH query' } },
              required: ['sql'],
            },
          },
          {
            name: 'list_tables',
            description:
              'READ ONLY — lists all tables in the public PostgreSQL schema with row estimates from pg_stat_user_tables. No writes.',
            inputSchema: { type: 'object', additionalProperties: false, properties: {} },
          },
          {
            name: 'describe_table',
            description:
              'READ ONLY — returns column definitions for a named table from information_schema.columns. No writes.',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: { table_name: { type: 'string', description: 'Table name to describe' } },
              required: ['table_name'],
            },
          },
        ],
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const toolStart = Date.now();
      this.logEvent('MCP.tools/call.start', { correlationId, tool: name, args: args ?? {} });

      let result: ToolResult;
      try {
        if (name === 'search_comparable_sales') {
          result = await this.withTimeout(
            this.searchComparableSales(args ?? {}, correlationId),
            10_000,
            name,
          );
        } else if (name === 'query') {
          result = await this.withTimeout(
            this.execQuery(args ?? {}, correlationId),
            10_000,
            name,
          );
        } else if (name === 'list_tables') {
          result = await this.withTimeout(this.listTables(correlationId), 10_000, name);
        } else if (name === 'describe_table') {
          result = await this.withTimeout(
            this.describeTable(args ?? {}, correlationId),
            10_000,
            name,
          );
        } else {
          result = { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        result = { content: [{ type: 'text', text: message }], isError: true };
      }

      const durationMs = Date.now() - toolStart;
      this.logEvent('MCP.audit', {
        correlationId,
        tool: name,
        args: args ?? {},
        durationMs,
        isError: result.isError ?? false,
      });
      return result;
    });

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      this.logEvent('MCP.request.complete', { correlationId, durationMs: Date.now() - start });
    } finally {
      await server.close();
    }
  }

  private async searchComparableSales(
    args: Record<string, unknown>,
    correlationId: string,
  ): Promise<ToolResult> {
    const dto = plainToInstance(SearchComparableSalesArgsDto, args);
    try {
      await validateOrReject(dto);
    } catch {
      return { content: [{ type: 'text', text: 'Invalid arguments for search_comparable_sales' }], isError: true };
    }

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (dto.suburb)    { conditions.push(`UPPER(property_locality) = UPPER($${idx++})`); params.push(dto.suburb); }
    if (dto.zoning)    { conditions.push(`UPPER(zoning) = UPPER($${idx++})`); params.push(dto.zoning); }
    if (dto.date_from) { conditions.push(`contract_date >= $${idx++}`); params.push(dto.date_from); }
    if (dto.date_to)   { conditions.push(`contract_date <= $${idx++}`); params.push(dto.date_to); }
    if (dto.area_min_sqm != null) {
      conditions.push(`(CASE WHEN area < 100 THEN area * 10000 ELSE area END) >= $${idx++}`);
      params.push(dto.area_min_sqm);
    }
    if (dto.area_max_sqm != null) {
      conditions.push(`(CASE WHEN area < 100 THEN area * 10000 ELSE area END) <= $${idx++}`);
      params.push(dto.area_max_sqm);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Number(dto.limit ?? 50), 200);
    const sql = `SELECT * FROM property_sales_raw ${where} ORDER BY contract_date DESC LIMIT ${limit}`;

    const t = Date.now();
    const rows = await this.dataSource.query(sql, params);
    this.logEvent('MCP.db.query', { correlationId, tool: 'search_comparable_sales', durationMs: Date.now() - t, rowCount: rows.length });
    return { content: [{ type: 'text', text: JSON.stringify(rows) }] };
  }

  private async execQuery(args: Record<string, unknown>, correlationId: string): Promise<ToolResult> {
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
    this.logEvent('MCP.db.query', { correlationId, tool: 'query', durationMs: Date.now() - t, rowCount: rows.length });
    return { content: [{ type: 'text', text: JSON.stringify(rows) }] };
  }

  private async listTables(correlationId: string): Promise<ToolResult> {
    const cached = this.getCached<ToolResult>('list_tables');
    if (cached) {
      this.logEvent('MCP.cache.hit', { correlationId, tool: 'list_tables' });
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
    this.logEvent('MCP.db.query', { correlationId, tool: 'list_tables', durationMs: Date.now() - t, rowCount: rows.length });

    const result: ToolResult = { content: [{ type: 'text', text: JSON.stringify(rows) }] };
    this.setCached('list_tables', result, 5 * 60 * 1000);
    return result;
  }

  private async describeTable(args: Record<string, unknown>, correlationId: string): Promise<ToolResult> {
    const dto = plainToInstance(DescribeTableArgsDto, args);
    try {
      await validateOrReject(dto);
    } catch {
      return { content: [{ type: 'text', text: 'table_name is required and must be a string' }], isError: true };
    }

    const cacheKey = `describe_table:${dto.table_name}`;
    const cached = this.getCached<ToolResult>(cacheKey);
    if (cached) {
      this.logEvent('MCP.cache.hit', { correlationId, tool: 'describe_table', tableName: dto.table_name });
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
    this.logEvent('MCP.db.query', { correlationId, tool: 'describe_table', tableName: dto.table_name, durationMs: Date.now() - t });

    const result: ToolResult = { content: [{ type: 'text', text: JSON.stringify(rows) }] };
    this.setCached(cacheKey, result, 5 * 60 * 1000);
    return result;
  }
}
