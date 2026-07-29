import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { SearchComparableSalesArgsDto } from '../dto/tool-args.dto';
import { IMcpTool, ToolResult } from './mcp-tool.interface';

@Injectable()
export class SearchComparablesTool implements IMcpTool {
  readonly name = 'search_comparable_sales';
  readonly description =
    'READ ONLY — queries property_sales_raw with parameterized filters. No writes. Prefer this over the raw query tool for comparable sales lookups.';
  readonly timeoutMs = 10_000;
  readonly inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      suburb:       { type: 'string', description: 'property_locality value to filter by' },
      zoning:       { type: 'string', description: 'Zoning code to filter by (e.g. E4, R2)' },
      date_from:    { type: 'string', description: 'Contract date from, YYYY-MM-DD' },
      date_to:      { type: 'string', description: 'Contract date to, YYYY-MM-DD' },
      area_min_sqm: { type: 'number', description: "Minimum land area in m² (rows with area_type='H' store area in hectares, converted automatically)" },
      area_max_sqm: { type: 'number', description: "Maximum land area in m² (rows with area_type='H' store area in hectares, converted automatically)" },
      limit:        { type: 'number', description: 'Max rows to return (default 50, max 200)' },
    },
  };

  private readonly logger = new Logger(SearchComparablesTool.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(args: Record<string, unknown>, correlationId: string): Promise<ToolResult> {
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
      conditions.push(`(CASE WHEN area_type = 'H' THEN area * 10000 ELSE area END) >= $${idx++}`);
      params.push(dto.area_min_sqm);
    }
    if (dto.area_max_sqm != null) {
      conditions.push(`(CASE WHEN area_type = 'H' THEN area * 10000 ELSE area END) <= $${idx++}`);
      params.push(dto.area_max_sqm);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Number(dto.limit ?? 50), 200);
    const sql = `SELECT * FROM property_sales_raw ${where} ORDER BY contract_date DESC LIMIT ${limit}`;

    const t = Date.now();
    const rows = await this.dataSource.query(sql, params);
    this.logger.log(JSON.stringify({ context: 'MCP.db.query', correlationId, tool: this.name, durationMs: Date.now() - t, rowCount: rows.length }));
    return { content: [{ type: 'text', text: JSON.stringify(rows) }] };
  }
}
