import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SiteConstraint } from './entities/site-constraints.entity';
import { DisputeDocument } from '../dispute-documents/entities/dispute-document.entity';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { SiteConstraintsController } from './site-constraints.controller';
import { SiteConstraintsService } from './site-constraints.service';
import { AzureBlobService } from '../../common/azure-blob/azure-blob.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SiteConstraint, DisputeCase, DisputeDocument]),
  ],
  controllers: [SiteConstraintsController],
  providers: [SiteConstraintsService, AzureBlobService],
  exports: [SiteConstraintsService],
})
export class SiteConstraintsModule {}