import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DisputeCase } from '../dispute-cases/entities/dispute-case.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { RedisCacheModule } from '../../common/redis-cache/redis-cache.module';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([DisputeCase]), RedisCacheModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
