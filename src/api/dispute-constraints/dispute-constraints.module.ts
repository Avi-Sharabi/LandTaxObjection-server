import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DisputeConstraint } from './entities/dispute-constraint.entity';
import { ConstraintFile } from '../constraint-files/entities/constraint-file.entity';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { AzureBlobModule } from '../../common/azure-blob/azure-blob.module';
import { DisputeConstraintsService } from './dispute-constraints.service';
import { DisputeConstraintsController } from './dispute-constraints.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([DisputeConstraint, ConstraintFile, DisputeCase]),
    AzureBlobModule,
  ],
  controllers: [DisputeConstraintsController],
  providers:   [DisputeConstraintsService],
  exports:     [DisputeConstraintsService],
})
export class DisputeConstraintsModule {}
