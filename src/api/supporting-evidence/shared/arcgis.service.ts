import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { EplanningApiData } from '../supporting-evidence.types';

const ENV_BASE = 'https://mapprod3.environment.nsw.gov.au/arcgis/rest/services';
const SIX_CADASTRE = 'https://maps.six.nsw.gov.au/arcgis/rest/services/public';

function geoParams(lat: number, lng: number, fields = '*') {
  return {
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: 4326,
    spatialRel: 'esriSpatialRelIntersects',
    outFields: fields,
    returnGeometry: false,
    f: 'json',
  };
}

@Injectable()
export class ArcgisService {
  private readonly logger = new Logger(ArcgisService.name);

  constructor(private readonly http: HttpService) {}

  async queryFloodLayers(lat: number, lng: number): Promise<Record<string, unknown> | null> {
    const LAYERS = [
      { label: 'Hazard Flood', url: `${ENV_BASE}/Planning/Hazard/MapServer/1/query` },
      { label: 'LEP Flood', url: `${ENV_BASE}/ePlanning/Planning_Portal_Principal_Planning/MapServer/8/query` },
      { label: 'SEPP Flood', url: `${ENV_BASE}/ePlanning/Planning_Portal_SEPP_Codes/MapServer/0/query` },
    ];

    const hits: Array<{ source: string; attrs: Record<string, unknown> }> = [];
    await Promise.all(
      LAYERS.map(async l => {
        try {
          const r = await firstValueFrom(
            this.http.get<{ features?: Array<{ attributes: Record<string, unknown> }> }>(l.url, {
              params: geoParams(lat, lng),
              timeout: 12000,
            }),
          );
          if (r.data?.features?.length) {
            hits.push({ source: l.label, attrs: r.data.features[0].attributes });
          }
        } catch (e: unknown) {
          this.logger.warn(`Flood ${l.label}: ${(e as Error).message}`);
        }
      }),
    );

    if (!hits.length) return null;

    const PRIORITY: Record<string, number> = { 'LEP Flood': 1, 'SEPP Flood': 2, 'Hazard Flood': 3 };
    const best = hits.slice().sort((a, b) => (PRIORITY[a.source] || 99) - (PRIORITY[b.source] || 99))[0];

    return {
      flood_zone_confirmed: true,
      zone_name: best.attrs['SEPP_NAME'] || best.attrs['SYM_CODE'] || best.attrs['FLOOD_CLASS'] || null,
      sources: hits.map(h => h.source),
      raw: best.attrs,
      all_flood_sources: hits.map(h => ({
        source: h.source,
        zone_name: h.attrs['SEPP_NAME'] || h.attrs['SYM_CODE'] || h.attrs['FLOOD_CLASS'] || null,
        attributes: h.attrs,
      })),
    };
  }

  buildFloodDataFromAPI(apiData: EplanningApiData): Record<string, unknown> | null {
    const { sepp = [], warn = [] } = apiData;
    const floodWarn = warn.find(w => /flood/i.test(w.layerRef || w.title || ''));
    const coastalSepp = sepp.find(s => (s.mapName || []).some(m => /coastal.*area|flood.*plan|hazard.*flood|resilience/i.test(m)));
    const coastalMaps = (coastalSepp?.mapName || []).filter(m => /coastal|flood|hazard/i.test(m));
    if (!floodWarn && !coastalMaps.length) return null;
    return {
      flood_zone_confirmed: true,
      zone_name: coastalMaps[0] || 'Flood/Coastal Planning Area',
      layer_name: coastalSepp?.seppName || 'Flood Warning',
      sources: [
        ...(floodWarn ? ['Flood Warning (ePlanning API)'] : []),
        ...(coastalMaps.length ? [`${coastalSepp?.seppName}: ${coastalMaps.join(', ')}`] : []),
      ],
      raw: { sepp: coastalSepp?.seppName, maps: coastalMaps, warn: floodWarn || null },
    };
  }

  async queryContaminatedLand(lat: number, lng: number): Promise<Record<string, unknown> | null> {
    try {
      const r = await firstValueFrom(
        this.http.get<{ features?: Array<{ attributes: Record<string, unknown> }> }>(
          `${ENV_BASE}/Planning/EPI_Primary_Planning_Layers/MapServer/12/query`,
          { params: geoParams(lat, lng), timeout: 12000 },
        ),
      );
      const feats = r.data?.features;
      if (!feats?.length) return null;
      const attrs = feats[0].attributes;
      const status = attrs['STATUS'] || attrs['Status'] || attrs['SITE_STATUS'] || null;
      this.logger.log(`Contaminated land hit: STATUS=${status}`);
      return { ...attrs, _status: status };
    } catch (e: unknown) {
      this.logger.warn(`Contaminated land: ${(e as Error).message}`);
      return null;
    }
  }

  async queryHeritageItems(lat: number, lng: number): Promise<Record<string, unknown>[] | null> {
    try {
      const r = await firstValueFrom(
        this.http.get<{ features?: Array<{ attributes: Record<string, unknown> }> }>(
          `${ENV_BASE}/Planning/EPI_Primary_Planning_Layers/MapServer/2/query`,
          {
            params: {
              ...geoParams(lat, lng, 'ITEM_NAME,SIGNIFICANCE,STATUS,EPI_NAME,ITEM_NO'),
            },
            timeout: 20000,
            headers: { 'User-Agent': 'Mozilla/5.0' },
          },
        ),
      );
      const feats = r.data?.features;
      if (!feats?.length) return null;
      return feats.map(f => f.attributes);
    } catch (e: unknown) {
      this.logger.warn(`Heritage items: ${(e as Error).message}`);
      return null;
    }
  }

  async queryVGLandValues(lat: number, lng: number, radiusDeg = 0.005): Promise<Record<string, unknown>[]> {
    const bbox = `${lng - radiusDeg},${lat - radiusDeg},${lng + radiusDeg},${lat + radiusDeg}`;
    try {
      const r = await firstValueFrom(
        this.http.get<{ features?: Array<{ attributes: Record<string, unknown> }> }>(
          `${SIX_CADASTRE}/NSW_LandValues/MapServer/0/query`,
          {
            params: {
              geometry: bbox,
              geometryType: 'esriGeometryEnvelope',
              inSR: 4326,
              spatialRel: 'esriSpatialRelIntersects',
              outFields: 'propid,lv,lvdate,area,zone,address',
              returnGeometry: false,
              resultRecordCount: 50,
              f: 'json',
            },
            timeout: 20000,
            headers: { 'User-Agent': 'Mozilla/5.0' },
          },
        ),
      );
      return (r.data?.features || []).map(f => f.attributes);
    } catch (e: unknown) {
      this.logger.warn(`VG Land Values: ${(e as Error).message}`);
      return [];
    }
  }

  async queryLotShape(lat: number, lng: number): Promise<{ flag: boolean | null; shape_area_m2: number | null; perimeter_m: number | null; isoperimetric_q: number | null }> {
    try {
      const r = await firstValueFrom(
        this.http.get<{ features?: Array<{ attributes: { shape_Area: number; shape_Length: number } }> }>(
          `${SIX_CADASTRE}/NSW_Cadastre/MapServer/9/query`,
          {
            params: {
              ...geoParams(lat, lng, 'shape_Area,shape_Length'),
            },
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0' },
          },
        ),
      );
      const attrs = r.data?.features?.[0]?.attributes;
      if (!attrs?.shape_Area || !attrs?.shape_Length) {
        return { flag: null, shape_area_m2: null, perimeter_m: null, isoperimetric_q: null };
      }
      const q = (4 * Math.PI * attrs.shape_Area) / Math.pow(attrs.shape_Length, 2);
      return {
        flag: q < 0.25,
        shape_area_m2: Math.round(attrs.shape_Area),
        perimeter_m: Math.round(attrs.shape_Length),
        isoperimetric_q: parseFloat(q.toFixed(4)),
      };
    } catch (e: unknown) {
      this.logger.warn(`Lot shape: ${(e as Error).message}`);
      return { flag: null, shape_area_m2: null, perimeter_m: null, isoperimetric_q: null };
    }
  }

  async queryOLSLayer(lat: number, lng: number): Promise<Record<string, unknown>[] | null> {
    try {
      const r = await firstValueFrom(
        this.http.get<{ features?: Array<{ attributes: Record<string, unknown> }> }>(
          `${ENV_BASE}/ePlanning/Planning_Portal_Principal_Planning/MapServer/0/query`,
          { params: geoParams(lat, lng), timeout: 12000 },
        ),
      );
      const feats = r.data?.features;
      return feats?.length ? feats.map(f => f.attributes) : null;
    } catch (e: unknown) {
      this.logger.warn(`OLS layer: ${(e as Error).message}`);
      return null;
    }
  }
}
