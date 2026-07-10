import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiUpdateLog } from './entities/ai-update-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AiUpdateLog])],
  exports: [TypeOrmModule],
})
export class AiUpdateLogModule {}
