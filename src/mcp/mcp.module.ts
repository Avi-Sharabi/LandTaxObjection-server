import { Module } from '@nestjs/common';
import { AiModule } from 'src/ai/ai.module';
import { AiUpdateLogModule } from 'src/api/ai-update-log/ai-update-log.module';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { McpAuthGuard } from './mcp-auth.guard';
import { SkillRegistryService } from './skill-registry.service';
import { UpdateDatabaseService } from '../api/ai-update-database/update-database.service';
import { SearchComparablesTool } from './tools/search-comparables.tool';
import { QueryTool } from './tools/query.tool';
import { ListTablesTool } from './tools/list-tables.tool';
import { DescribeTableTool } from './tools/describe-table.tool';
import { UpdateDatabaseTool } from './tools/update-database.tool';

@Module({
  imports: [AiModule, AiUpdateLogModule],
  controllers: [McpController],
  providers: [
    McpService,
    McpAuthGuard,
    SkillRegistryService,
    UpdateDatabaseService,
    SearchComparablesTool,
    QueryTool,
    ListTablesTool,
    DescribeTableTool,
    UpdateDatabaseTool,
  ],
  exports: [McpService, SkillRegistryService, UpdateDatabaseService],
})
export class McpModule {}
