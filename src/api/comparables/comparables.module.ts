import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { AiModule } from '../../ai/ai.module';
import { ComparableSale } from './entities/comparable-sale.entity';
import { NswLocalityCentroid } from './entities/nsw-locality-centroid.entity';
import { ComparablesController } from './comparables.controller';
import { ComparablesService } from './comparables.service';
import { ComparablesQueueService } from './comparables-queue.service';
import { ComparablesProcessor, COMPARABLE_GENERATION_QUEUE } from './comparables.processor';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { McpModule } from '../../mcp/mcp.module';
import { GeocodingService } from '../supporting-evidence/shared/geocoding.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ComparableSale, NswLocalityCentroid, DisputeCase]),
    BullModule.registerQueue({ name: COMPARABLE_GENERATION_QUEUE }),
    HttpModule,
    AiModule,
    McpModule,
  ],
  controllers: [ComparablesController],
  providers: [ComparablesService, ComparablesQueueService, ComparablesProcessor, GeocodingService],
  exports: [ComparablesService, ComparablesQueueService],
})
export class ComparablesModule {}
