import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ValuationNotice } from '../valuation-notices/entities/valuation-notice.entity';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { ValuationController } from './valuation.controller';
import { ValuationService } from './valuation.service';
import { ValuationRepository } from './valuation.repository';
import { LandTaxComputationService } from './land-tax-computation.service';
import { LandTaxRate } from './entities/land-tax-rate.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ValuationNotice, DisputeCase, LandTaxRate])],
  controllers: [ValuationController],
  providers: [ValuationService, ValuationRepository, LandTaxComputationService],
  exports: [LandTaxComputationService],
})
export class ValuationModule {}
