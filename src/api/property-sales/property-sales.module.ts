import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { PropertySalesConfig } from './property-sales.config';
import { ArchiveStoreService } from './storage/archive-store.service';
import { PsiBrowserService } from './shared/psi-browser.service';
import { SourceDiscoveryService } from './discovery/source-discovery.service';
import { PropertySalesDownloadService } from './property-sales-download.service';
import { PropertySalesDownloadProcessor, PROPERTY_SALES_DOWNLOAD_QUEUE } from './property-sales-download.processor';
import { PropertySalesQueueService } from './property-sales-queue.service';
import { PropertySalesDownloadTask } from './property-sales-download.task';
import { PropertySalesRetentionService } from './property-sales-retention.service';
import { PropertySalesRetentionTask } from './property-sales-retention.task';
import { PropertySalesController } from './property-sales.controller';
import { PropertySalesArchive } from './entities/property-sales-archive.entity';

// KAN-241: NSW Property Sales weekly archive download.
// Providers are added incrementally through the ticket's implementation
// phases; the module started out empty (registered into APIModule and
// build/boot-verified in isolation) before any logic landed.
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([PropertySalesArchive]),
    BullModule.registerQueue({
      name: PROPERTY_SALES_DOWNLOAD_QUEUE,
      // attempts: 1 is deliberate — the service already retries per-archive
      // on the next cron tick; a BullMQ-level retry would relaunch Chrome
      // and re-download instead of resuming the ledger's own retry policy.
      defaultJobOptions: { attempts: 1, removeOnComplete: 50, removeOnFail: 100 },
    }),
  ],
  controllers: [PropertySalesController],
  providers: [
    PropertySalesConfig,
    ArchiveStoreService,
    PsiBrowserService,
    SourceDiscoveryService,
    PropertySalesDownloadService,
    PropertySalesDownloadProcessor,
    PropertySalesQueueService,
    PropertySalesDownloadTask,
    PropertySalesRetentionService,
    PropertySalesRetentionTask,
  ],
})
export class PropertySalesModule {}
