import { join } from 'node:path';

/**
 * Project-relative scratch root for one archive sync's downloaded archives
 * and extracted .dat files. `.tmp` is already gitignored. Wiped at boot
 * (PropertySalesService.onModuleInit) so a crash mid-sync can't leave
 * orphaned directories behind across restarts within the same container.
 */
export const TMP_ROOT = join(process.cwd(), '.tmp', 'property-sales');

/**
 * Puppeteer launch mode. Shared by PsiBrowserService (actual launch option)
 * and SourceDiscoveryService (diagnostic-only, embedded in exception context).
 */
export const HEADLESS = true;

/**
 * Puppeteer navigation timeout. Shared by
 * SourceDiscoveryService.discoverArchiveCandidates and archive-download.ts's
 * DownloadSession navigation call.
 */
export const BROWSER_TIMEOUT_MS = 60_000;

/**
 * Hosts PSI archive download URLs must resolve to. Shared by
 * SourceDiscoveryService and archive-ingestion.ts (both call
 * assertAllowedDownloadUrl).
 */
export const ALLOWED_DOWNLOAD_HOSTS: readonly string[] = [
  'valuation.property.nsw.gov.au',
  'www.valuergeneral.nsw.gov.au',
  'valuergeneral.nsw.gov.au',
];
