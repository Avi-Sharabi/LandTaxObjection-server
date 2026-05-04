import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ValuationNotice } from '../valuation-notices/entities/valuation-notice.entity';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { ComparableSale } from '../comparables/entities/comparable-sale.entity';
import { ValuationController } from './valuation.controller';
import { ValuationService } from './valuation.service';
import { ValuationRepository } from './valuation.repository';
import { LandTaxComputationService } from './land-tax-computation.service';

@Module({
  imports: [TypeOrmModule.forFeature([ValuationNotice, DisputeCase, ComparableSale])],
  controllers: [ValuationController],
  providers: [ValuationService, ValuationRepository, LandTaxComputationService],
})
export class ValuationModule {}
