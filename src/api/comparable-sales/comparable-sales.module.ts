import { Module } from '@nestjs/common';
import { ComparableSalesController } from './comparable-sales.controller';
import { ComparableSalesRepository } from './comparable-sales.repository';
import { ComparableSalesService } from './comparable-sales.service';

@Module({
  controllers: [ComparableSalesController],
  providers: [ComparableSalesService, ComparableSalesRepository],
  exports: [ComparableSalesService],
})
export class ComparableSalesModule {}
