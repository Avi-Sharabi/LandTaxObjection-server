import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PropertySalesConfig } from './property-sales.config';
import { ArchiveStoreService } from './storage/archive-store.service';
import { PsiBrowserService } from './shared/psi-browser.service';
import { SourceDiscoveryService } from './discovery/source-discovery.service';

// KAN-241: NSW Property Sales weekly archive download.
// Providers are added incrementally through the ticket's implementation
// phases; the module started out empty (registered into APIModule and
// build/boot-verified in isolation) before any logic landed.
@Module({
  imports: [ConfigModule],
  providers: [PropertySalesConfig, ArchiveStoreService, PsiBrowserService, SourceDiscoveryService],
})
export class PropertySalesModule {}
