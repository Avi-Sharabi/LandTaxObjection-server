import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Server } from '@modelcontextprotocol/sdk/server';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Request, Response } from 'express';
import { SkillRegistryService } from './skill-registry.service';
import { IMcpTool, ToolResult } from './tools/mcp-tool.interface';
import { SearchComparablesTool } from './tools/search-comparables.tool';
import { QueryTool } from './tools/query.tool';
import { ListTablesTool } from './tools/list-tables.tool';
import { DescribeTableTool } from './tools/describe-table.tool';
import { UpdateDatabaseTool } from './tools/update-database.tool';
import { GetCaseDocumentsTool } from './tools/get-case-documents.tool';
import { UploadAllCaseDocumentsTool } from './tools/upload-all-case-documents.tool';
import { UploadFyiTool } from './tools/upload-fyi.tool';

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);
  private readonly tools: IMcpTool[];

  constructor(
    private readonly skillRegistry: SkillRegistryService,
    searchComparablesTool: SearchComparablesTool,
    queryTool: QueryTool,
    listTablesTool: ListTablesTool,
    describeTableTool: DescribeTableTool,
    updateDatabaseTool: UpdateDatabaseTool,
    uploadFyiTool: UploadFyiTool,
    getCaseDocumentsTool: GetCaseDocumentsTool,
    uploadAllCaseDocumentsTool: UploadAllCaseDocumentsTool,
  ) {
    this.tools = [
      searchComparablesTool,
      queryTool,
      listTablesTool,
      describeTableTool,
      updateDatabaseTool,
      uploadFyiTool,
      getCaseDocumentsTool,
      uploadAllCaseDocumentsTool,
    ];
  }

  getSkillContent(name: string): string {
    return this.skillRegistry.getSkillContent(name);
  }

  private logEvent(context: string, data: Record<string, unknown>): void {
    this.logger.log(JSON.stringify({ context, ...data, ts: new Date().toISOString() }));
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
      resources: [...this.skillRegistry.getAllSkills().entries()].map(([name]) => ({
        uri: `skill://${name}`,
        name,
        description: `Domain skill: ${name.replace(/-/g, ' ')}`,
        mimeType: 'text/markdown',
      })),
    }));

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const name = request.params.uri.replace('skill://', '');
      const content = this.skillRegistry.getAllSkills().get(name);
      if (!content) throw new Error(`Resource not found: ${request.params.uri}`);
      return {
        contents: [{ uri: request.params.uri, mimeType: 'text/markdown', text: content }],
      };
    });

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logEvent('MCP.tools/list', { correlationId });
      return {
        tools: this.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const toolStart = Date.now();
      this.logEvent('MCP.tools/call.start', { correlationId, tool: name, args: args ?? {} });

      let result: ToolResult;
      const tool = this.tools.find((t) => t.name === name);

      try {
        if (tool) {
          result = await this.withTimeout(tool.execute(args ?? {}, correlationId), tool.timeoutMs, name);
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
}
