import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly client: Redis | null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('REDIS_HOST');
    const port = this.configService.get<number>('REDIS_PORT');

    if (!host || !port) {
      this.client = null;
      return;
    }

    const password = this.configService.get<string>('REDIS_PASSWORD') || undefined;
    const tls = this.configService.get<string>('REDIS_TLS') === 'true';

    this.client = new Redis({
      host,
      port,
      password,
      ...(tls && { tls: {} }),
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });

    this.client.on('error', (err) => {
      this.logger.warn(`Redis cache error: ${err.message}`);
    });
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client) return null;
    try {
      const value = await this.client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlMs: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.set(key, JSON.stringify(value), 'PX', ttlMs);
    } catch {
      // cache failure is non-fatal — request proceeds without caching
    }
  }

  onModuleDestroy(): void {
    this.client?.disconnect();
  }
}
