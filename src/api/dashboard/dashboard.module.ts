import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([DisputeCase])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
