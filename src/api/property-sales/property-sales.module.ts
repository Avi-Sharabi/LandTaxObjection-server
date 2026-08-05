import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PropertySalesArchive } from './entities/property-sales-archive.entity';
import { PropertySalesRepository } from './property-sales.repository';
import { PropertySalesService } from './property-sales.service';
import { PropertySalesTask } from './property-sales.task';
import { PsiBrowserService } from './psi-browser.service';
import { SourceDiscoveryService } from './source-discovery.service';

@Module({
  imports: [TypeOrmModule.forFeature([PropertySalesArchive])],
  providers: [
    PropertySalesRepository,
    PsiBrowserService,
    SourceDiscoveryService,
    PropertySalesService,
    PropertySalesTask,
  ],
})
export class PropertySalesModule {}
