import { Module } from '@nestjs/common';
import { McpModule } from '../../mcp/mcp.module';
import { UpdateDatabaseController } from './update-database.controller';

@Module({
  imports: [McpModule],
  controllers: [UpdateDatabaseController],
})
export class AiUpdateDatabaseModule {}
