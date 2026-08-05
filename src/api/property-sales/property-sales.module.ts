import { Module } from '@nestjs/common';

import { PropertySalesService } from './property-sales.service';
import { PropertySalesTask } from './property-sales.task';
import { PsiBrowserService } from './psi-browser.service';
import { SourceDiscoveryService } from './source-discovery.service';

@Module({
  providers: [
    PsiBrowserService,
    SourceDiscoveryService,
    PropertySalesService,
    PropertySalesTask,
  ],
})
export class PropertySalesModule {}
