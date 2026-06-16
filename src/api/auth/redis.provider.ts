import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { isProduction } from '../../config/environment';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export const RedisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis =>
    new Redis({
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: config.getOrThrow<number>('REDIS_PORT'),
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 200, 5000),
      ...(isProduction(config) && {
        password: config.getOrThrow<string>('REDIS_PASSWORD'),
        tls: {},
        enableReadyCheck: false,
        keepAlive: 30000,
      }),
    }),
};
