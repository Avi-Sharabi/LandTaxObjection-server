import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { McpAuthGuard } from './mcp-auth.guard';
import { UpdateDatabaseService } from './update-database.service';
import { UpdateDatabaseController } from './update-database.controller';

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [McpController, UpdateDatabaseController],
  providers: [McpService, McpAuthGuard, UpdateDatabaseService],
  exports: [McpService],
})
export class McpModule {}
