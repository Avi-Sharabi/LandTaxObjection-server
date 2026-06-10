import { ConfigService } from '@nestjs/config';
import type { BullRootModuleOptions } from '@nestjs/bullmq';
import { isProduction } from './environment';

export function createRedisConfig(config: ConfigService): BullRootModuleOptions {
  return {
    connection: {
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: config.getOrThrow<number>('REDIS_PORT'),
      lazyConnect: true,
      maxRetriesPerRequest: null,   // required by BullMQ
      retryStrategy: (times) => Math.min(times * 200, 5000),
      ...(isProduction(config) && {
        password: config.getOrThrow<string>('REDIS_PASSWORD'),
        tls: {},
        enableReadyCheck: false,
        keepAlive: 30000,
      }),
    },
  };
}
