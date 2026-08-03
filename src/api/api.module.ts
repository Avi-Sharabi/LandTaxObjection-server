import { Module } from '@nestjs/common';
import { AiUpdateDatabaseModule } from './ai-update-database/update-database.module';
import { AssessmentDocumentsModule } from './assessment-documents/assessment-documents.module';
import { ClientsModule } from './clients/clients.module';
import { CleanupModule } from './cleanup/cleanup.module';
import { ComparablesModule } from './comparables/comparables.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DisputeCasesModule } from './dispute-cases/dispute-cases.module';
import { DisputeConstraintsModule } from './dispute-constraints/dispute-constraints.module';
import { DisputeLegalGroundsModule } from './dispute-legal-grounds/dispute-legal-grounds.module';
import { FyiAiModule } from './fyi-ai/fyi-ai.module';
import { FyiUploadModule } from './fyi-upload/fyi-upload.module';
import { LocationModule } from './location/location.module';
import { PropertiesModule } from './properties/properties.module';
import { UsersModule } from './users/users.module';
import { ValuationNoticesModule } from './valuation-notices/valuation-notices.module';
import { ValuationModule } from './valuation/valuation.module';
import { AuthModule } from './auth/auth.module';
import { ObjectionPackageModule } from './objection-package/objection-package.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PropertySalesModule } from './property-sales/property-sales.module';

@Module({
  imports: [
    AiUpdateDatabaseModule,
    AuthModule,
    AssessmentDocumentsModule,
    ClientsModule,
    CleanupModule,
    ComparablesModule,
    DashboardModule,
    FyiAiModule,
    FyiUploadModule,
    LocationModule,
    PropertiesModule,
    DisputeCasesModule,
    DisputeConstraintsModule,
    ValuationNoticesModule,
    ValuationModule,
    UsersModule,
    DisputeLegalGroundsModule,
    ObjectionPackageModule,
    NotificationsModule,
    PropertySalesModule,
  ],
})
export class APIModule {}