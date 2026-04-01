import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AzureBlobModule } from '../../common/azure-blob/azure-blob.module';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { PackageDocument } from './entities/package-document.entity';
import { ObjectionPackageController } from './objection-package.controller';
import { ObjectionPackageRepository } from './objection-package.repository';
import { ObjectionPackageService } from './objection-package.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PackageDocument, DisputeCase]),
    AzureBlobModule,
  ],
  controllers: [ObjectionPackageController],
  providers: [ObjectionPackageRepository, ObjectionPackageService, RolesGuard],
})
export class ObjectionPackageModule {}
