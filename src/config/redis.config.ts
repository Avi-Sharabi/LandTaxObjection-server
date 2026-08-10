import { ConfigService } from '@nestjs/config';
import type { BullRootModuleOptions } from '@nestjs/bullmq';
import type { RedisOptions } from 'ioredis';
import { isProduction } from './environment';

export function createRedisConnectionOptions(
  config: ConfigService,
  overrides: Partial<RedisOptions> = {},
): RedisOptions {
  return {
    host: config.getOrThrow<string>('REDIS_HOST'),
    port: parseInt(config.getOrThrow<string>('REDIS_PORT'), 10),
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => (times > 10 ? null : Math.min(times * 200, 5000)),
    ...(isProduction(config) && {
      password: config.getOrThrow<string>('REDIS_PASSWORD'),
      tls: {},
      enableReadyCheck: false,
      keepAlive: 30000,
    }),
    ...overrides,
  };
}

export function createRedisConfig(config: ConfigService): BullRootModuleOptions {
  return { connection: createRedisConnectionOptions(config, { maxRetriesPerRequest: null }) };
}