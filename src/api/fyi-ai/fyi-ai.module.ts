import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { McpModule } from '../../mcp/mcp.module';
import { FyiAiController } from './fyi-ai.controller';
import { FyiAiService } from './fyi-ai.service';

@Module({
  imports: [ConfigModule, McpModule],
  controllers: [FyiAiController],
  providers: [FyiAiService],
})
export class FyiAiModule {}
