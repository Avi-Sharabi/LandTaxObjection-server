import { Injectable } from '@nestjs/common';
import { IMcpTool, ToolResult } from './mcp-tool.interface';
import { UpdateDatabaseService } from '../../api/ai-update-database/update-database.service';
import { SkillRegistryService } from '../skill-registry.service';

@Injectable()
export class UpdateDatabaseTool implements IMcpTool {
  readonly name = 'update_database';
  readonly description =
    'AI WRITE — pass a plain-text English instruction describing the database update to perform. ' +
    'Claude reasoning mode interprets the instruction using the update-database skill and executes it. ' +
    'Example: "Set status to vg_approved for the dispute case with reference LT-2024-001". ' +
    'Writes are validated against the allowed-column allowlist and status transition rules from update-database.md. ' +
    'Audit log is written automatically using the MCP system user. ' +
    'PROTECTED TABLES (writes not allowed): clients, properties, dispute_cases, valuation_notices, notifications, ' +
    'package_documents, ai_update_logs, comparable_sales, valuation_notice_files, constraint_files, ' +
    'dispute_documents, assessment_documents, dispute_legal_grounds, dispute_constraints. ' +
    'AI-EDITABLE TABLES: users (full_name, role, phone, is_active), ' +
    'land_tax_rates (tax_year, threshold, base_amount, marginal_rate_pct, premium_threshold, premium_base_amount, premium_rate_pct, foreign_surcharge_pct). ' +
    'Returns the write-back schema from update-database.md.';
  readonly timeoutMs = 60_000;
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
