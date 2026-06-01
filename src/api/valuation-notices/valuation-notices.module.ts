import { Module } from '@nestjs/common';
import { ValuationNoticesService } from './valuation-notices.service';
import { ValuationNoticesController } from './valuation-notices.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ValuationNotice } from './entities/valuation-notice.entity';
import { AzureBlobModule } from 'src/common/azure-blob/azure-blob.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ValuationNotice]),
    AzureBlobModule,
  ],
  controllers: [ValuationNoticesController],
  providers: [ValuationNoticesService],
  exports: [ValuationNoticesService],
})
export class ValuationNoticesModule { }
