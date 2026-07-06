import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.constant';

@Injectable()
export class ForgotPasswordThrottleService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async recordAttemptAndCheck(
    key: string,
    maxAttempts: number,
    windowSeconds: number,
  ): Promise<boolean> {
    const redisKey = `forgot_password_attempts:${key}`;
    const attempts = await this.redis.incr(redisKey);

    if (attempts === 1) {
      await this.redis.expire(redisKey, windowSeconds);
    }

    return attempts <= maxAttempts;
  }
}
