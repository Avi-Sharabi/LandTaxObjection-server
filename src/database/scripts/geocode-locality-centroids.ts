import { Logger } from '@nestjs/common';
import axios from 'axios';
import { AppDataSource } from '../data-source';

// One-time/incremental backfill: resolves a lat/lng centroid for every distinct
// property_locality in property_sales_raw so comparables.service.ts can gate
// candidate sales by real distance instead of postcode-prefix string matching.
// Safe to re-run — only geocodes localities not already present in nsw_locality_centroids.

const logger = new Logger('GeocodeLocalityCentroids');
const GEOCODE_URL =
  'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';
const REQUEST_DELAY_MS = 250;

interface GeocodeCandidatesResponse {
  candidates: Array<{ location: { x: number; y: number } }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodeLocality(locality: string): Promise<{ lat: number; lng: number } | null> {
  const res = await axios.get<GeocodeCandidatesResponse>(GEOCODE_URL, {
    params: { SingleLine: `${locality}, NSW, Australia`, outFields: '*', forStorage: false, f: 'json' },
    timeout: 15000,
  });
  const candidate = res.data?.candidates?.[0];
  if (!candidate) return null;
  return { lat: candidate.location.y, lng: candidate.location.x };
}

async function run(): Promise<void> {
  const dataSource = await AppDataSource.initialize();
  try {
    const localities: Array<{ property_locality: string }> = await dataSource.query(`
      SELECT DISTINCT UPPER(TRIM(property_locality)) AS property_locality
      FROM property_sales_raw
      WHERE property_locality IS NOT NULL AND TRIM(property_locality) != ''
    `);
    const existing: Array<{ locality: string }> = await dataSource.query(
      `SELECT locality FROM nsw_locality_centroids`,
    );
    const existingSet = new Set(existing.map((r) => r.locality));
    const toGeocode = localities
      .map((r) => r.property_locality)
      .filter((locality) => !existingSet.has(locality));

    logger.log(`${toGeocode.length} of ${localities.length} distinct localities need geocoding.`);

    let succeeded = 0;
    let failed = 0;
    for (const locality of toGeocode) {
      try {
        const coords = await geocodeLocality(locality);
        if (!coords) {
          logger.warn(`No geocode candidate for "${locality}"`);
          failed++;
        } else {
          await dataSource.query(
            `INSERT INTO nsw_locality_centroids (locality, lat, lng, source, geocoded_at)
             VALUES ($1, $2, $3, 'arcgis', now())
             ON CONFLICT (locality) DO UPDATE SET lat = $2, lng = $3, geocoded_at = now()`,
            [locality, coords.lat, coords.lng],
          );
          succeeded++;
        }
      } catch (err) {
        logger.error(`Geocoding failed for "${locality}": ${(err as Error).message}`);
        failed++;
      }
      await sleep(REQUEST_DELAY_MS);
    }

    logger.log(`Done. Geocoded ${succeeded}, failed ${failed}.`);
  } finally {
    await dataSource.destroy();
  }
}

run().catch((err) => {
  logger.error('geocode-locality-centroids failed:', err);
  process.exit(1);
});
