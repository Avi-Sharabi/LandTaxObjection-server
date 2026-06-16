import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.provider';

@Injectable()
export class TokenBlacklistService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async add(jti: string, expiresAt: number): Promise<void> {
    const ttlSeconds = Math.ceil((expiresAt - Date.now()) / 1000);
    if (ttlSeconds > 0) {
      await this.redis.set(`blacklist:${jti}`, '1', 'EX', ttlSeconds);
    }
  }

  async has(jti: string): Promise<boolean> {
    const result = await this.redis.exists(`blacklist:${jti}`);
    return result === 1;
  }
}
