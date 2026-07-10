import { Module } from '@nestjs/common';
import { AiModule } from 'src/ai/ai.module';
import { AiUpdateLogModule } from 'src/api/ai-update-log/ai-update-log.module';
import { AzureBlobModule } from '../common/azure-blob/azure-blob.module';
import { fyiStorageModule } from '../common/fyi-storage/fyi-storage.module';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { SkillRegistryService } from './skill-registry.service';
import { UpdateDatabaseService } from '../api/ai-update-database/update-database.service';
import { SearchComparablesTool } from './tools/search-comparables.tool';
import { QueryTool } from './tools/query.tool';
import { ListTablesTool } from './tools/list-tables.tool';
import { DescribeTableTool } from './tools/describe-table.tool';
import { UpdateDatabaseTool } from './tools/update-database.tool';
import { GetCaseDocumentsTool } from './tools/get-case-documents.tool';
import { UploadAllCaseDocumentsTool } from './tools/upload-all-case-documents.tool';
import { UploadFyiTool } from './tools/upload-fyi.tool';

@Module({
  imports: [AiModule, AiUpdateLogModule, fyiStorageModule, AzureBlobModule],
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
    UploadFyiTool,
    GetCaseDocumentsTool,
    UploadAllCaseDocumentsTool,
  ],
  exports: [
    McpService,
    SkillRegistryService,
    UpdateDatabaseService,
    UploadFyiTool,
    GetCaseDocumentsTool,
    UploadAllCaseDocumentsTool,
  ],
})
export class McpModule {}
