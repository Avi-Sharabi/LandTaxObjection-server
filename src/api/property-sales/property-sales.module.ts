import { Module } from '@nestjs/common';

// KAN-241: NSW Property Sales weekly archive download.
// Providers are added incrementally through the ticket's implementation
// phases; this module is registered early (empty) so wiring into
// APIModule is verified in isolation before any logic lands.
@Module({})
export class PropertySalesModule {}
