import { ConfigService } from '@nestjs/config';
import type { BullRootModuleOptions } from '@nestjs/bullmq';
import { isProduction } from './environment';

export function createRedisConfig(config: ConfigService): BullRootModuleOptions {
  return {
    connection: {
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: config.getOrThrow<number>('REDIS_PORT'),
      ...(isProduction(config) && {
        password: config.getOrThrow<string>('REDIS_PASSWORD'),
        tls: {},
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
      }),
    },
  };
}
