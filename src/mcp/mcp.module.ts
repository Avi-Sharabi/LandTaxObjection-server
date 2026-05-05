import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { McpAuthGuard } from './mcp-auth.guard';

@Module({
  controllers: [McpController],
  providers: [McpService, McpAuthGuard],
  exports: [McpService],
})
export class McpModule {}
