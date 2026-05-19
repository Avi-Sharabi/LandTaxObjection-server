import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { AiModule } from '../../ai/ai.module';
import { ComparableSale } from './entities/comparable-sale.entity';
import { ComparablesController } from './comparables.controller';
import { ComparablesService } from './comparables.service';
import { ComparablesQueueService } from './comparables-queue.service';
import { ComparablesProcessor, COMPARABLE_GENERATION_QUEUE } from './comparables.processor';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { McpModule } from '../../mcp/mcp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ComparableSale, DisputeCase]),
    BullModule.registerQueue({ name: COMPARABLE_GENERATION_QUEUE }),
    AiModule,
    McpModule,
  ],
  controllers: [ComparablesController],
  providers: [ComparablesService, ComparablesQueueService, ComparablesProcessor],
  exports: [ComparablesService],
})
export class ComparablesModule {}
