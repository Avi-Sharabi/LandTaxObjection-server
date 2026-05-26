import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([DisputeCase])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
