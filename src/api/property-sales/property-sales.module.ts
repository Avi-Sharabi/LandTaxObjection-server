import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PropertySalesConfig } from './property-sales.config';
import { PropertySalesService } from './property-sales.service';
import { PropertySalesTask } from './property-sales.task';
import { PsiBrowserService } from './psi-browser.service';
import { SourceDiscoveryService } from './source-discovery.service';

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
