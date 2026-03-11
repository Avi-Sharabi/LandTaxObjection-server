import { Module } from '@nestjs/common';
import { DisputeLegalGroundsService } from './dispute-legal-grounds.service';
import { DisputeLegalGroundsController } from './dispute-legal-grounds.controller';

@Module({
  controllers: [DisputeLegalGroundsController],
  providers: [DisputeLegalGroundsService],
})
export class DisputeLegalGroundsModule {}
