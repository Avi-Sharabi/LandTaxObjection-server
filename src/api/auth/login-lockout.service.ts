import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.constant';
import {
  LOGIN_MAX_ATTEMPTS,
  LOGIN_ATTEMPTS_WINDOW_SECONDS,
  LOGIN_LOCK_DURATION_SECONDS,
} from './constants/login-lockout.constants';

@Injectable()
export class LoginLockoutService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async recordFailedAttempt(ip: string): Promise<void> {
    const key = `login_attempts:${ip}`;
    const attempts = await this.redis.incr(key);

    if (attempts === 1) {
      await this.redis.expire(key, LOGIN_ATTEMPTS_WINDOW_SECONDS);
    }

    if (attempts >= LOGIN_MAX_ATTEMPTS) {
      await this.redis.set(
        `login_lock:${ip}`,
        '1',
        'EX',
        LOGIN_LOCK_DURATION_SECONDS,
      );
    }
  }

  async isLocked(ip: string): Promise<boolean> {
    return (await this.redis.exists(`login_lock:${ip}`)) === 1;
  }

  async resetAttempts(ip: string): Promise<void> {
    await this.redis.del(`login_attempts:${ip}`, `login_lock:${ip}`);
  }
}
