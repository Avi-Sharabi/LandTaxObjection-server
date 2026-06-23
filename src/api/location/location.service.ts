import { BadGatewayException, Inject, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type Redis from 'ioredis';
import { StateResponseDto } from './dto/state.response.dto';
import { SuburbResponseDto } from './dto/suburb.response.dto';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';

const TTL_7D = 7 * 24 * 60 * 60;

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService,
  ) {
    this.baseUrl = config.get<string>('LOCATION_API_URL') ?? 'https://v0.postcodeapi.com.au';
  }

  private async cacheGet<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  private async cacheSet(key: string, data: unknown): Promise<void> {
    await this.redis.set(key, JSON.stringify(data), 'EX', TTL_7D);
  }

  async getAustraliaStates(): Promise<StateResponseDto[]> {
    const cacheKey = 'au:states';
    const cached = await this.cacheGet<StateResponseDto[]>(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await firstValueFrom(
        this.http.get<{ name: string; abbreviation: string }[]>(`${this.baseUrl}/states.json`),
      );
      const states = data
        .map((s) => ({ name: s.name, state_code: s.abbreviation }))
        .sort((a, b) => a.name.localeCompare(b.name));
      await this.cacheSet(cacheKey, states);
      return states;
    } catch (err) {
      this.logger.error('Failed to fetch Australia states', err);
      throw new BadGatewayException('Upstream location API unavailable');
    }
  }

  private async fetchSuburbs(state: string, q?: string): Promise<SuburbResponseDto[]> {
    const params = new URLSearchParams({ state });
    if (q) params.append('q', q);
    const { data } = await firstValueFrom(
      this.http.get<SuburbResponseDto[]>(`${this.baseUrl}/suburbs.json?${params.toString()}`),
    );
    return data ?? [];
  }

  async getCitiesByState(state: string): Promise<string[]> {
    const cacheKey = `au:cities:${state}`;
    const cached = await this.cacheGet<string[]>(cacheKey);
    if (cached) return cached;

    try {
      const suburbs = await this.fetchSuburbs(state);
      const cities = suburbs.map((s) => s.name).sort((a, b) => a.localeCompare(b));
      await this.cacheSet(cacheKey, cities);
      return cities;
    } catch (err) {
      this.logger.error(`Failed to fetch cities for state: ${state}`, err);
      throw new BadGatewayException('Upstream location API unavailable');
    }
  }

  async searchSuburbs(state: string, q?: string): Promise<SuburbResponseDto[]> {
    const cacheKey = `au:suburbs:${state}:${q ?? ''}`;
    const cached = await this.cacheGet<SuburbResponseDto[]>(cacheKey);
    if (cached) return cached;

    try {
      const suburbs = await this.fetchSuburbs(state, q);
      const sorted = suburbs.sort((a, b) => a.name.localeCompare(b.name));
      await this.cacheSet(cacheKey, sorted);
      return sorted;
    } catch (err) {
      this.logger.error(`Failed to fetch suburbs for state: ${state}, q: ${q}`, err);
      throw new BadGatewayException('Upstream location API unavailable');
    }
  }
}
