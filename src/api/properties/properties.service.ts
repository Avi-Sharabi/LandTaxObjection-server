import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Property } from './entities/property.entity';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { GetPropertiesQueryDto } from '../../common/dto/paginated-query.dto';
import { PaginatedPropertiesResult, PropertyListItem } from './dto/property-list-item.dto';

// Hoisted to module scope so these are constructed once, not per row/request.
const NUMBER = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });
const DATE = new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });

@Injectable()
export class PropertiesService {
  constructor(
    @InjectRepository(Property)
    private readonly propertiesRepository: Repository<Property>,
  ) {}

  async findOne(id: string): Promise<Property> {
    const property = await this.propertiesRepository.findOne({ where: { id } });
    if (!property) throw new NotFoundException(`Property #${id} not found`);
    return property;
  }

  async update(id: string, dto: UpdatePropertyDto): Promise<Property> {
    const property = await this.findOne(id);
    Object.assign(property, dto);
    return this.propertiesRepository.save(property);
  }

  async findAllPaginated(query: GetPropertiesQueryDto): Promise<PaginatedPropertiesResult> {
    const { page = 1, limit = 10, clientId } = query;

    const [rows, total] = await this.propertiesRepository.findAndCount({
      where: clientId ? { client_id: clientId } : {},
      relations: { dispute_cases: true },
      // dispute_cases is a one-to-many relation — the default "join" strategy
      // would LEFT JOIN it and apply skip/take to the multiplied row set,
      // corrupting both `data` and `total` for any property with 2+ cases.
      // "query" loads it via a separate follow-up query instead.
      relationLoadStrategy: 'query',
      select: {
        id: true,
        pid: true,
        address: true,
        suburb: true,
        state: true,
        postcode: true,
        zoning: true,
        lot_dp: true,
        dimensions: true,
        land_area_sqm: true,
        land_area_eplanning_sqm: true,
        ownership_pct: true,
        height_limit_m: true,
        created_at: true,
        dispute_cases: { id: true, case_reference: true },
      },
      // id tiebreaker: created_at alone can tie when intake creates several
      // properties in one batch, which would shuffle rows between pages.
      order: { created_at: 'DESC', id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: rows.map((row) => this.toListItem(row)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private toListItem(property: Property): PropertyListItem {
    const landArea = this.toNumber(property.land_area_sqm);
    const landAreaEplanning = this.toNumber(property.land_area_eplanning_sqm);
    const ownershipPct = this.toNumber(property.ownership_pct);
    const heightLimit = this.toNumber(property.height_limit_m);

    return {
      id: property.id,
      // `|| null` rather than `?? null`: intake creates properties with
      // postcode: '' (see DisputeIntakeOrchestrator.createProperty), and an
      // empty string slips past the frontend's `value ?? '—'`, rendering a
      // labelled but blank field instead of an em-dash.
      pid: property.pid || null,
      address: property.address || null,
      locality: [property.suburb, property.state, property.postcode].filter(Boolean).join(', '),
      zoning: property.zoning || null,
      lot_dp: property.lot_dp || null,
      dimensions: property.dimensions || null,
      postcode: property.postcode || null,
      land_area_sqm: landArea,
      land_area_display: this.formatMeasure(landArea, 'm²'),
      land_area_eplanning_sqm: landAreaEplanning,
      land_area_eplanning_display: this.formatMeasure(landAreaEplanning, 'm²'),
      ownership_pct: ownershipPct,
      ownership_display: this.formatPercent(ownershipPct),
      height_limit_m: heightLimit,
      height_limit_display: this.formatMeasure(heightLimit, 'm'),
      created_at: property.created_at,
      added_display: DATE.format(property.created_at),
      cases: (property.dispute_cases ?? []).map((c) => ({
        id: c.id,
        case_reference: c.case_reference,
      })),
    };
  }

  // Postgres `numeric` columns come back from `pg` as strings ("1200.00")
  // since there's no TypeORM transformer on them — coerce before formatting,
  // or every display string below renders "NaN".
  private toNumber(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }

  private formatMeasure(value: number | null, unit: string): string | null {
    return value === null ? null : `${NUMBER.format(value)} ${unit}`;
  }

  private formatPercent(value: number | null): string | null {
    return value === null ? null : `${value.toFixed(2)}%`;
  }
}
