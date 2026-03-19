import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComparableSale } from './entities/comparable-sale.entity';
import { ComparablesController } from './comparables.controller';
import { ComparablesService } from './comparables.service';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ComparableSale, DisputeCase]),
  ],
  controllers: [ComparablesController],
  providers: [ComparablesService],
  exports: [ComparablesService],
})
export class ComparablesModule {}
