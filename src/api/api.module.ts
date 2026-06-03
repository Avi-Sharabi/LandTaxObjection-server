import { Module } from '@nestjs/common';
import { AssessmentDocumentsModule } from './assessment-documents/assessment-documents.module';
import { ClientsModule } from './clients/clients.module';
import { ComparablesModule } from './comparables/comparables.module';
import { DisputeCasesModule } from './dispute-cases/dispute-cases.module';
import { DisputeConstraintsModule } from './dispute-constraints/dispute-constraints.module';
import { DisputeLegalGroundsModule } from './dispute-legal-grounds/dispute-legal-grounds.module';
import { FyiAiModule } from './fyi-ai/fyi-ai.module';
import { FyiUploadModule } from './fyi-upload/fyi-upload.module';
import { PropertiesModule } from './properties/properties.module';
import { UsersModule } from './users/users.module';
import { ValuationNoticesModule } from './valuation-notices/valuation-notices.module';
import { ValuationModule } from './valuation/valuation.module';
import { AuthModule } from './auth/auth.module';
import { ObjectionPackageModule } from './objection-package/objection-package.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    AuthModule,
    AssessmentDocumentsModule,
    ClientsModule,
    ComparablesModule,
    FyiAiModule,
    FyiUploadModule,
    PropertiesModule,
    DisputeCasesModule,
    DisputeConstraintsModule,
    ValuationNoticesModule,
    ValuationModule,
    UsersModule,
    DisputeLegalGroundsModule,
    ObjectionPackageModule,
    NotificationsModule,
  ],
})
export class APIModule {}