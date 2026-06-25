import { ConfigService } from '@nestjs/config';
import type { BullRootModuleOptions } from '@nestjs/bullmq';
import type { RedisOptions } from 'ioredis';
import { isProduction } from './environment';

export function createRedisConnectionOptions(config: ConfigService): RedisOptions {
  return {
    host: config.getOrThrow<string>('REDIS_HOST'),
    port: config.getOrThrow<number>('REDIS_PORT'),
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: null,
    retryStrategy: (times) => Math.min(times * 200, 5000),
    ...(isProduction(config) && {
      password: config.getOrThrow<string>('REDIS_PASSWORD'),
      tls: {},
      enableReadyCheck: false,
      keepAlive: 30000,
    }),
  };
}

export function createRedisConfig(config: ConfigService): BullRootModuleOptions {
  return { connection: createRedisConnectionOptions(config) };
}