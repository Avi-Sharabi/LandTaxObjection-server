import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createRedisConfig } from '../config/redis.config';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => createRedisConfig(config),
      inject: [ConfigService],
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
