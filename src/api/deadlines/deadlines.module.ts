import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { DeadlinesController } from './deadlines.controller';
import { DeadlinesService } from './deadlines.service';

@Module({
  imports: [TypeOrmModule.forFeature([DisputeCase])],
  controllers: [DeadlinesController],
  providers: [DeadlinesService],
})
export class DeadlinesModule {}
