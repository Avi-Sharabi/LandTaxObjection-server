import { BadGatewayException, Inject, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type { Redis } from 'ioredis';
import { CityResponseDto } from './dto/city.response.dto';
import { REDIS_CLIENT } from '../../common/redis/redis.constant';

const TTL_7D_S = 7 * 24 * 60 * 60;

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.baseUrl = config.get<string>('LOCATION_API_URL') ?? 'https://v0.postcodeapi.com.au';
  }

  private async cacheGet<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.logger.warn(`LocationCache.get_failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private async cacheSet(key: string, data: unknown): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(data), 'EX', TTL_7D_S);
    } catch (err) {
      this.logger.warn(`LocationCache.set_failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async searchCities(state: string): Promise<CityResponseDto[]> {
    const key = `au:cities:${state}`;
    const cached = await this.cacheGet<CityResponseDto[]>(key);
    if (cached) return cached;

    try {
      const params = new URLSearchParams({ state });
      const { data } = await firstValueFrom(
        this.http.get<CityResponseDto[]>(`${this.baseUrl}/suburbs.json?${params}`),
      );
      const sorted = (data ?? []).sort((a, b) => a.name.localeCompare(b.name));
      await this.cacheSet(key, sorted);
      return sorted;
    } catch (err) {
      this.logger.error(`Failed to fetch cities — state: ${state}`, err);
      throw new BadGatewayException('Upstream location API unavailable');
    }
  }
}
