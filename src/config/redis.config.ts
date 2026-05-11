import { ConfigService } from '@nestjs/config';
import type { BullRootModuleOptions } from '@nestjs/bullmq';
import { isProduction } from './environment';

export function createRedisConfig(config: ConfigService): BullRootModuleOptions {
  return {
    connection: {
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
      lazyConnect: true,
      enableOfflineQueue: false,
      ...(isProduction(config) && {
        password: config.getOrThrow<string>('REDIS_PASSWORD'),
        tls: {},
        lazyConnect: true,
        maxRetriesPerRequest: null,   // required by BullMQ
        enableReadyCheck: false,      // recommended for Azure Redis
      }),
    },
  };
}
