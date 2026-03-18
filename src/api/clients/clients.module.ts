import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AzureBlobService } from 'src/common/azure-blob/azure-blob.service';
import { fyiStorageService } from 'src/common/fyi-storage/fyi-storage.service';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { ValuationNotice } from '../valuation-notices/entities/valuation-notice.entity';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { Client } from './entities/client.entity';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([Client, DisputeCase, ValuationNotice])],
  controllers: [ClientsController],
  providers: [ClientsService, AzureBlobService, fyiStorageService],
})
export class ClientsModule { }
