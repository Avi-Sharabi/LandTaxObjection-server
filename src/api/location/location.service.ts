import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { StateResponseDto } from './dto/state.response.dto';
import { SuburbResponseDto } from './dto/suburb.response.dto';
import { AU_STATES } from '../../common/enums/australia.constants';

const TTL_7D_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);
  private readonly baseUrl: string;
  private readonly cache = new Map<string, { data: unknown; expiresAt: number }>();

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.baseUrl = config.get<string>('LOCATION_API_URL') ?? 'https://v0.postcodeapi.com.au';
  }

  private cacheGet<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private cacheSet(key: string, data: unknown): void {
    this.cache.set(key, { data, expiresAt: Date.now() + TTL_7D_MS });
  }

  getAustraliaStates(): readonly StateResponseDto[] {
    return AU_STATES;
  }

  async getCitiesByState(state: string): Promise<string[]> {
    const suburbs = await this.searchSuburbs(state);
    return suburbs.map((s) => s.name);
  }

  async searchSuburbs(state: string, q?: string): Promise<SuburbResponseDto[]> {
    const key = `au:suburbs:${state}:${q ?? ''}`;
    const cached = this.cacheGet<SuburbResponseDto[]>(key);
    if (cached) return cached;

    try {
      const params = new URLSearchParams({ state });
      if (q) params.append('q', q);
      const { data } = await firstValueFrom(
        this.http.get<SuburbResponseDto[]>(`${this.baseUrl}/suburbs.json?${params}`),
      );
      const sorted = (data ?? []).sort((a, b) => a.name.localeCompare(b.name));
      this.cacheSet(key, sorted);
      return sorted;
    } catch (err) {
      this.logger.error(`Failed to fetch suburbs — state: ${state}, q: ${q}`, err);
      throw new BadGatewayException('Upstream location API unavailable');
    }
  }
}
