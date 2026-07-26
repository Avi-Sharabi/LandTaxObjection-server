import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { DisputeCase } from './entities/dispute-case.entity';
import { Property } from '../properties/entities/property.entity';
import { LandValueSearch } from '../supporting-evidence/supporting-evidence.types';
import { parsePlausibleLandAreaSqm } from '../../common/utils/land-area.util';

@Injectable()
export class AiPropertySearchService {
  private readonly logger = new Logger(AiPropertySearchService.name);

  constructor(
    @InjectRepository(DisputeCase) private readonly disputeCaseRepo: Repository<DisputeCase>,
    @InjectRepository(Property) private readonly propertyRepo: Repository<Property>,
  ) {}

  /**
   * Persists the subject land size and supplementary fields extracted from the uploaded NSW
   * Valuer General "Land Value Search" document (PdfExtractorService's land_value_search branch)
   * onto the property. This is now the sole source of subject land size (see
   * property-context.service.ts) — deliberately does NOT touch zoning/lot_dp, which remain owned
   * by persistZoningAndLotDp below (that call runs later in analyze-ai.processor.ts; writing both
   * here and there would race).
   */
  async persistLandValueSearchDetails(disputeCaseId: string, doc: LandValueSearch): Promise<void> {
    const dc = await this.disputeCaseRepo.findOne({
      where: { id: disputeCaseId },
      relations: ['property'],
    });
    if (!dc?.property) {
      this.logger.warn(JSON.stringify({
        context: 'AiPropertySearch.land_value_search_skipped_no_property',
        disputeCaseId,
      }));
      return;
    }

    const plausibleAreaSqm = parsePlausibleLandAreaSqm(doc.property_area_sqm, {
      source: 'land_value_search',
      disputeCaseId,
    });
    let anyFieldPersisted = false;

    if (plausibleAreaSqm != null) {
      // land_area_sqm — not land_area_eplanning_sqm — is the only area field CreatePropertyDto/
      // UpdatePropertyDto expose, so it's the one a caseworker's manual PATCH correction actually
      // touches. Guarding the write on `land_area_sqm: IsNull()` as part of the UPDATE's WHERE
      // clause (rather than reading the value first and deciding in JS) makes "never clobber an
      // existing value" atomic — safe even if this method is invoked twice concurrently for the
      // same case (e.g. a BullMQ stalled-job redispatch of the same job id).
      const result = await this.propertyRepo.update(
        { id: dc.property.id, land_area_sqm: IsNull() },
        { land_area_eplanning_sqm: plausibleAreaSqm, land_area_sqm: plausibleAreaSqm },
      );
      if (result.affected) {
        anyFieldPersisted = true;
        this.logger.log(JSON.stringify({
          context: 'AiPropertySearch.land_value_search_area_persisted',
          propertyId: dc.property.id,
          land_area_sqm: plausibleAreaSqm,
        }));
      } else {
        this.logger.log(JSON.stringify({
          context: 'AiPropertySearch.land_value_search_area_skipped_existing_value',
          disputeCaseId,
          propertyId: dc.property.id,
          extractedValue: plausibleAreaSqm,
        }));
      }
    }

    if (doc.property_no) {
      // pid is the primary automated match key VgEmailAnalysisService uses to correlate an
      // incoming Valuer-General decision email back to this case — an OCR misread must never
      // silently overwrite an existing value, same atomicity reasoning as land area above.
      const result = await this.propertyRepo.update(
        { id: dc.property.id, pid: IsNull() },
        { pid: doc.property_no },
      );
      if (result.affected) {
        anyFieldPersisted = true;
        this.logger.log(JSON.stringify({
          context: 'AiPropertySearch.land_value_search_pid_persisted',
          propertyId: dc.property.id,
          pid: doc.property_no,
        }));
      } else {
        this.logger.log(JSON.stringify({
          context: 'AiPropertySearch.land_value_search_pid_skipped_existing_value',
          disputeCaseId,
          propertyId: dc.property.id,
          extractedValue: doc.property_no,
        }));
      }
    }

    if (doc.property_dimensions && doc.property_dimensions.toUpperCase() !== 'NOT AVAILABLE') {
      // Same atomicity/non-clobbering reasoning as land area and pid above — dimensions is also
      // manually editable via PATCH /properties/:id.
      const result = await this.propertyRepo.update(
        { id: dc.property.id, dimensions: IsNull() },
        { dimensions: doc.property_dimensions },
      );
      if (result.affected) {
        anyFieldPersisted = true;
        this.logger.log(JSON.stringify({
          context: 'AiPropertySearch.land_value_search_dimensions_persisted',
          propertyId: dc.property.id,
          dimensions: doc.property_dimensions,
        }));
      } else {
        this.logger.log(JSON.stringify({
          context: 'AiPropertySearch.land_value_search_dimensions_skipped_existing_value',
          disputeCaseId,
          propertyId: dc.property.id,
        }));
      }
    }

    if (!anyFieldPersisted) {
      // Presence flags only, never the extracted content itself — this document carries a
      // taxpayer's property address/land description, which has no reason to land in general
      // application logs.
      this.logger.warn(JSON.stringify({
        context: 'AiPropertySearch.land_value_search_no_fields_extracted',
        disputeCaseId,
        propertyId: dc.property.id,
        hasPropertyAreaSqm: doc.property_area_sqm != null,
        hasPropertyDimensions: !!doc.property_dimensions,
        hasPropertyNo: !!doc.property_no,
      }));
    }
  }

  /**
   * Persists the ePlanning-resolved zoning code and lot/DP identifier onto the property —
   * mirrors persistLandValueSearchDetails above. Without this, both values are only ever passed
   * into the comparables-generation DTO for a single request and never saved, so the report (and
   * any later comparables run) sees them as unknown even though ePlanning already resolved them.
   */
  async persistZoningAndLotDp(disputeCaseId: string, zoning: string | null, lotDp: string | null): Promise<void> {
    const dc = await this.disputeCaseRepo.findOne({
      where: { id: disputeCaseId },
      relations: ['property'],
    });
    if (!dc?.property) return;

    const updates: Partial<Property> = {};
    if (zoning) updates.zoning = zoning;
    if (lotDp) updates.lot_dp = lotDp;
    if (Object.keys(updates).length === 0) return;

    await this.propertyRepo.update({ id: dc.property.id }, updates);
    this.logger.log(JSON.stringify({
      context: 'AiPropertySearch.zoning_lot_dp_persisted',
      propertyId: dc.property.id,
      ...updates,
    }));
  }
}
