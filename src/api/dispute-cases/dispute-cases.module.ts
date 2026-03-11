import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../clients/entities/client.entity';
import { DisputeLegalGround } from '../dispute-legal-grounds/entities/dispute-legal-ground.entity';
import { Property } from '../properties/entities/property.entity';
import { User } from '../users/entities/user.entity';
import { ValuationNotice } from '../valuation-notices/entities/valuation-notice.entity';
import { DisputeCasesController } from './dispute-cases.controller';
import { DisputeCasesService } from './dispute-cases.service';
import { DisputeCase } from './entities/dispute-case.entity';
import { AzureBlobModule } from 'src/common/azure-blob/azure-blob.module';

@Module({
  imports: [
    HttpModule,
    AzureBlobModule,
    TypeOrmModule.forFeature([
      DisputeCase,
      DisputeLegalGround,
      Client,
      Property,
      ValuationNotice,
      User,
    ]),
  ],
  controllers: [DisputeCasesController],
  providers: [DisputeCasesService],
})
export class DisputeCasesModule { }
