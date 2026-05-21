import { Module } from '@nestjs/common';
import { fyiStorageModule } from '../common/fyi-storage/fyi-storage.module';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { UploadFyiTool } from './tools/upload-fyi.tool';

@Module({
  imports: [fyiStorageModule],
  controllers: [McpController],
  providers: [McpService, McpAuthGuard, UploadFyiTool],
  exports: [McpService],
})
export class McpModule {}
