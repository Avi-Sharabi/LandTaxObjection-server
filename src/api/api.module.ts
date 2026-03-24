import { Module } from '@nestjs/common';
import { ClientsModule } from './clients/clients.module';
import { ComparablesModule } from './comparables/comparables.module';
import { DisputeCasesModule } from './dispute-cases/dispute-cases.module';
import { DisputeLegalGroundsModule } from './dispute-legal-grounds/dispute-legal-grounds.module';
import { PropertiesModule } from './properties/properties.module';
import { UsersModule } from './users/users.module';
import { ValuationNoticesModule } from './valuation-notices/valuation-notices.module';
import { ValuationModule } from './valuation/valuation.module';
import { AuthModule } from './auth/auth.module';
import { SiteConstraintsModule } from './site-constraints/site-constraints.module';

@Module({
  imports: [
    AuthModule,
    ClientsModule,
    ComparablesModule,
    PropertiesModule,
    DisputeCasesModule,
    ValuationNoticesModule,
    ValuationModule,
    UsersModule,
    DisputeLegalGroundsModule,
    SiteConstraintsModule,
  ],
})
export class APIModule {}