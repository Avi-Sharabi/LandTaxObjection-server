import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.constant';

@Injectable()
export class LoginLockoutService {
  private readonly logger = new Logger(LoginLockoutService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async recordFailedAttempt(
    key: string,
    maxAttempts: number,
    windowSeconds: number,
    lockDurationSeconds: number,
  ): Promise<void> {
    try {
      const attemptsKey = `login_attempts:${key}`;
      const attempts = await this.redis.incr(attemptsKey);

      if (attempts === 1) {
        await this.redis.expire(attemptsKey, windowSeconds);
      }

      if (attempts >= maxAttempts) {
        await this.redis.set(
          `login_lock:${key}`,
          '1',
          'EX',
          lockDurationSeconds,
        );
      }
    } catch (err) {
      this.logger.warn(`Redis unavailable, skipping failed-attempt tracking: ${err.message}`);
    }
  }

  async isLocked(key: string): Promise<boolean> {
    try {
      return (await this.redis.exists(`login_lock:${key}`)) === 1;
    } catch (err) {
      this.logger.warn(`Redis unavailable, failing open on lockout check: ${err.message}`);
      return false;
    }
  }

  async resetAttempts(key: string): Promise<void> {
    try {
      await this.redis.del(`login_attempts:${key}`, `login_lock:${key}`);
    } catch (err) {
      this.logger.warn(`Redis unavailable, skipping attempt reset: ${err.message}`);
    }
  }
}
