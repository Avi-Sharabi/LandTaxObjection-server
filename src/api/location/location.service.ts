import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { StateResponseDto } from './dto/state.response.dto';
import { SuburbResponseDto } from './dto/suburb.response.dto';

const TTL_24H = 24 * 60 * 60 * 1_000;

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);
  private readonly _cache = new Map<string, { data: unknown; expiresAt: number }>();

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private cacheGet<T>(key: string): T | null {
    const entry = this._cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this._cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private cacheSet(key: string, data: unknown, ttlMs = TTL_24H): void {
    this._cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  async getAustraliaStates(): Promise<StateResponseDto[]> {
    const cacheKey = 'au:states';
    const cached = this.cacheGet<StateResponseDto[]>(cacheKey);
    if (cached) return cached;

    try {
      const baseUrl = this.config.get<string>('COUNTRIESNOW_BASE_URL');
      const { data } = await firstValueFrom(
        this.http.get(`${baseUrl}/countries/states`),
      );
      const au = (data.data as { name: string; states: StateResponseDto[] }[]).find(
        (c) => c.name === 'Australia',
      );
      const states = (au?.states ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
      this.cacheSet(cacheKey, states);
      return states;
    } catch (err) {
      this.logger.error('Failed to fetch Australia states', err);
      throw new BadGatewayException('Upstream location API unavailable');
    }
  }

  async getCitiesByState(state: string): Promise<string[]> {
    const cacheKey = `au:cities:${state}`;
    const cached = this.cacheGet<string[]>(cacheKey);
    if (cached) return cached;

    try {
      const baseUrl = this.config.get<string>('COUNTRIESNOW_BASE_URL');
      const { data } = await firstValueFrom(
        this.http.post(`${baseUrl}/countries/state/cities`, {
          country: 'Australia',
          state,
        }),
      );
      const cities: string[] = data.data ?? [];
      this.cacheSet(cacheKey, cities);
      return cities;
    } catch (err) {
      this.logger.error(`Failed to fetch cities for state: ${state}`, err);
      throw new BadGatewayException('Upstream location API unavailable');
    }
  }

  async searchSuburbs(state: string, q?: string): Promise<SuburbResponseDto[]> {
    const cacheKey = `au:suburbs:${state}:${q ?? ''}`;
    const cached = this.cacheGet<SuburbResponseDto[]>(cacheKey);
    if (cached) return cached;

    try {
      const baseUrl = this.config.get<string>('POSTCODEAPI_BASE_URL');
      const params = new URLSearchParams({ state });
      if (q) params.append('q', q);

      const { data } = await firstValueFrom(
        this.http.get<SuburbResponseDto[]>(`${baseUrl}/suburbs.json?${params.toString()}`),
      );
      const suburbs = (data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
      this.cacheSet(cacheKey, suburbs);
      return suburbs;
    } catch (err) {
      this.logger.error(`Failed to fetch suburbs for state: ${state}, q: ${q}`, err);
      throw new BadGatewayException('Upstream location API unavailable');
    }
  }
}
