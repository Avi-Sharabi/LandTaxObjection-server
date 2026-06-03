import { Module } from '@nestjs/common';
import { AzureBlobModule } from '../common/azure-blob/azure-blob.module';
import { fyiStorageModule } from '../common/fyi-storage/fyi-storage.module';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { GetCaseDocumentsTool } from './tools/get-case-documents.tool';
import { UploadAllCaseDocumentsTool } from './tools/upload-all-case-documents.tool';
import { UploadFyiTool } from './tools/upload-fyi.tool';

@Module({
  imports: [fyiStorageModule, AzureBlobModule],
  controllers: [McpController],
  providers: [McpService, McpAuthGuard, UploadFyiTool, GetCaseDocumentsTool, UploadAllCaseDocumentsTool],
  exports: [McpService, UploadFyiTool, GetCaseDocumentsTool, UploadAllCaseDocumentsTool],
})
export class McpModule {}
