import { Module } from '@nestjs/common';
import { ValuationNoticesService } from './valuation-notices.service';
import { ValuationNoticesController } from './valuation-notices.controller';

@Module({
  controllers: [ValuationNoticesController],
  providers: [ValuationNoticesService],
})
export class ValuationNoticesModule {}
