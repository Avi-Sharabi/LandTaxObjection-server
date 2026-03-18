import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { SiteConstraint } from './entities/site-constraint.entity';
import { SiteConstraintsController } from './site-constraints.controller';
import { SiteConstraintsService } from './site-constraints.service';
import { SiteConstraintRetryJob } from './jobs/site-constraint-retry.job';
import { AzureEmailService } from '../../common/azure-email/azure-email.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SiteConstraint]),
    ScheduleModule.forRoot(),
  ],
  controllers: [SiteConstraintsController],
  providers: [SiteConstraintsService, SiteConstraintRetryJob, AzureEmailService],
  exports: [SiteConstraintsService],
})
export class SiteConstraintsModule {}