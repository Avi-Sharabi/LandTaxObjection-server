import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DisputeCase } from './entities/dispute-case.entity';
import { Property } from '../properties/entities/property.entity';
import { AnthropicService } from 'src/ai/anthropic.service';

export interface AiPropertySearchResult {
  land_area_sqm: number | null;
}

@Injectable()
export class AiPropertySearchService {
  private readonly logger = new Logger(AiPropertySearchService.name);

  constructor(
    @InjectRepository(DisputeCase) private readonly disputeCaseRepo: Repository<DisputeCase>,
    @InjectRepository(Property) private readonly propertyRepo: Repository<Property>,
    private readonly anthropic: AnthropicService,
  ) {}

  async enrichPropertyFromWeb(
    disputeCaseId: string,
    address: string,
    eplanningAreaM2?: number,
  ): Promise<AiPropertySearchResult | null> {
    const dc = await this.disputeCaseRepo.findOne({
      where: { id: disputeCaseId },
      relations: ['property'],
    });
    if (!dc?.property) return null;

    const result = await this.searchLandArea(address);
    if (!result?.land_area_sqm) return null;

    // Persist to DB only when AI found a multi-lot site area (≥1.5× the registered lot area).
    // This prevents a bad AI run returning the registered lot area from corrupting the DB value.
    const isMultiLot = !eplanningAreaM2 || result.land_area_sqm >= eplanningAreaM2 * 1.5;
    if (isMultiLot) {
      await this.propertyRepo.update({ id: dc.property.id }, { land_area_sqm: result.land_area_sqm });
      this.logger.log(JSON.stringify({
        context: 'AiPropertySearch.persisted',
        propertyId: dc.property.id,
        land_area_sqm: result.land_area_sqm,
        eplanningAreaM2,
      }));
    } else {
      this.logger.log(JSON.stringify({
        context: 'AiPropertySearch.skipped_write',
        propertyId: dc.property.id,
        land_area_sqm: result.land_area_sqm,
        eplanningAreaM2,
        reason: 'result too close to ePlanning lot area',
      }));
    }

    return result;
  }

  private async searchLandArea(address: string): Promise<AiPropertySearchResult | null> {
    const safeAddress = address.slice(0, 200).replace(/[\r\n]/g, ' ');

    const prompt =
      `I need the TOTAL SITE AREA in square metres for the property at ${safeAddress}. ` +
      `This may be a development site comprising multiple amalgamated lots — I need the TOTAL assembled area, NOT the individual cadastral lot area from land title records. ` +
      `Search real estate listings, council DA documents, planning portals, and news articles about this site. ` +
      `If you find the area in hectares, convert to m² (1 hectare = 10,000 m²). ` +
      `End your response with a JSON summary on its own line: {"land_area_sqm": <number>} or {"land_area_sqm": null} if the total site area cannot be determined.`;

    try {
      const text = await this.anthropic.callWithWebSearch(prompt);
      if (!text) return null;
      return this.parseResult(text);
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number; data?: unknown } })?.response?.status;
      const body = (e as { response?: { data?: unknown } })?.response?.data;
      this.logger.warn(JSON.stringify({
        context: 'AiPropertySearch.search_failed',
        address,
        status,
        body,
        message: (e as Error).message,
      }));
      return null;
    }
  }

  private parseResult(text: string): AiPropertySearchResult | null {
    const matches = [...text.matchAll(/"land_area_sqm"\s*:\s*(\d+(?:\.\d+)?|null)/g)];
    if (!matches.length) return null;
    const last = matches[matches.length - 1];
    const val = last[1] === 'null' ? null : parseFloat(last[1]);
    return { land_area_sqm: val };
  }
}
