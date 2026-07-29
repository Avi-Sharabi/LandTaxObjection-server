import { Logger } from '@nestjs/common';

/**
 * Subject land size is sourced exclusively from the AI-extracted "NSW Valuer General — Land
 * Value Search" document (see PropertyContextService.gatherSharedContext /
 * AiPropertySearchService.persistLandValueSearchDetails) — there is no ePlanning/cadastre
 * fallback. Since that number now drives every downstream $/m² valuation figure, this guard is
 * the only thing standing between a malformed OCR/LLM read and a bogus land-tax objection number.
 */
const logger = new Logger('LandAreaUtil');

export const LAND_AREA_MIN_SQM = 10; // smallest plausible strata/lot
export const LAND_AREA_MAX_SQM = 500_000; // generous ceiling for large rural lots

export function parsePlausibleLandAreaSqm(
  value: unknown,
  context: { source: string; disputeCaseId?: string },
): number | null {
  const area = typeof value === 'number' ? value : Number(value);
  if (
    value == null ||
    !Number.isFinite(area) ||
    area < LAND_AREA_MIN_SQM ||
    area > LAND_AREA_MAX_SQM
  ) {
    if (value != null) {
      logger.warn(JSON.stringify({
        context: 'LandAreaUtil.implausible_land_area_rejected',
        source: context.source,
        disputeCaseId: context.disputeCaseId,
        rawValue: value,
      }));
    }
    return null;
  }
  return area;
}
