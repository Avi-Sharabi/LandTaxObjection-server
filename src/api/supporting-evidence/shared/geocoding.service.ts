import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CadastreFeature } from '../supporting-evidence.types';
import { GeocodingFailedException } from '../exceptions/supporting-evidence.exceptions';

const CADASTRE_URL = 'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Cadastre/MapServer/9/query';
const ADJACENT_LOTS_RADIUS_DEG = 0.003; // ~333m bounding box

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  constructor(private readonly http: HttpService) {}

  async geocode(address: string): Promise<{ lat: number; lng: number }> {
    const res = await firstValueFrom(
      this.http.get<{ candidates: Array<{ location: { x: number; y: number } }> }>(
        'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates',
        { params: { SingleLine: address, outFields: '*', forStorage: false, f: 'json' }, timeout: 15000 },
      ),
    );
    const cand = res.data.candidates?.[0];
    if (!cand) throw new GeocodingFailedException(address);
    const lat = cand.location.y;
    const lng = cand.location.x;
    this.logger.log(`Geocoded ${address}: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    return { lat, lng };
  }

  async getLotInfoFromCadastre(lat: number, lng: number): Promise<CadastreFeature | null> {
    const res = await firstValueFrom(
      this.http.get<{ features: Array<{ attributes: Record<string, unknown> }> }>(CADASTRE_URL, {
        params: {
          geometry: `${lng},${lat}`,
          geometryType: 'esriGeometryPoint',
          inSR: 4326,
          spatialRel: 'esriSpatialRelIntersects',
          outFields: 'lotidstring,planlabel,cadid,shape_Area',
          returnGeometry: false,
          f: 'json',
        },
        timeout: 15000,
      }),
    );
    const feat = res.data?.features?.[0]?.attributes;
    if (!feat) return null;

    const areaM2 = feat['shape_Area'] ? Math.round(feat['shape_Area'] as number) : null;
    const planMatch = String(feat['planlabel'] || '').match(/^([A-Z]+)(\d+)$/i);
    const rawLot = String(feat['lotidstring'] || '').split('//')[0].trim();

    return {
      lot: rawLot || null,
      plan: planMatch ? planMatch[2] : null,
      planType: planMatch ? planMatch[1].toUpperCase() : 'DP',
      areaM2,
      cadId: feat['cadid'] as string | null,
    };
  }

  async getAdjacentLots(lat: number, lng: number, radiusDeg = ADJACENT_LOTS_RADIUS_DEG): Promise<Record<string, unknown>[]> {
    const res = await firstValueFrom(
      this.http.get<{ features: Array<{ attributes: Record<string, unknown> }> }>(CADASTRE_URL, {
        params: {
          geometry: `${lng - radiusDeg},${lat - radiusDeg},${lng + radiusDeg},${lat + radiusDeg}`,
          geometryType: 'esriGeometryEnvelope',
          inSR: 4326,
          spatialRel: 'esriSpatialRelIntersects',
          outFields: 'lotidstring,planlabel,cadid,shape_Area',
          returnGeometry: false,
          f: 'json',
        },
        timeout: 15000,
      }),
    );
    return (res.data?.features || []).map(f => f.attributes);
  }
}
