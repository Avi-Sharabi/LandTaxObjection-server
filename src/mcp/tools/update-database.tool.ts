import { Injectable } from '@nestjs/common';
import { IMcpTool, ToolResult } from './mcp-tool.interface';
import { UpdateDatabaseService } from '../update-database.service';
import { SkillRegistryService } from '../skill-registry.service';

@Injectable()
export class UpdateDatabaseTool implements IMcpTool {
  readonly name = 'update_database';
  readonly description =
    'AI WRITE — pass plain-text instructions describing a database update. ' +
    'Claude reasoning mode interprets the instruction using the update-database skill and executes it. ' +
    'Example: "Update dispute_cases, set status to vg_approved for record <uuid>, performed by <uuid>". ' +
    'Writes are validated against allowed tables from update-database.md. ' +
    'Returns the write-back schema from update-database.md.';
  readonly timeoutMs = 30_000;
  readonly inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      instruction: {
        type: 'string',
        description: 'Plain-text description of the database update to perform.',
      },
    },
    required: ['instruction'],
  };

  constructor(
    private readonly updateDatabaseService: UpdateDatabaseService,
    private readonly skillRegistry: SkillRegistryService,
  ) {}

  async execute(args: Record<string, unknown>, correlationId: string): Promise<ToolResult> {
    const timestamp = new Date().toISOString();
    const skillContent = this.skillRegistry.getSkillContent('update-database');
    if (!skillContent) {
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: false, reason: 'update-database skill is not loaded on this server.', timestamp,
        }) }],
        isError: true,
      };
    }
    return this.updateDatabaseService.execute(args, skillContent, correlationId);
  }
}
