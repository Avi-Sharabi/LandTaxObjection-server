import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PropertySalesConfig } from './property-sales.config';
import { PropertySalesService } from './property-sales.service';
import { PropertySalesTask } from './property-sales.task';
import {
  PsiBrowserService,
  SourceDiscoveryService,
} from './discovery-and-download';

/**
 * KAN-241: NSW Property Sales weekly ingestion — cron trigger -> read the DB
 * for the latest data -> download via puppeteer -> unzip -> parse the .dat
 * (including filtering). Deliberately no TypeOrmModule.forFeature and no
 * BullModule here: there is no ledger entity (property_sales_raw is read via
 * a raw query in PropertySalesService) and no queue (the cron task calls
 * PropertySalesService.run() directly).
 */
@Module({
  imports: [ConfigModule],
  providers: [
    PropertySalesConfig,
    PsiBrowserService,
    SourceDiscoveryService,
    PropertySalesService,
    PropertySalesTask,
  ],
})
export class PropertySalesModule {}
