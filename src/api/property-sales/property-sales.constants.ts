export const GIB = 1024 ** 3;

/**
 * Puppeteer launch mode. Shared by PsiBrowserService (actual launch option)
 * and SourceDiscoveryService (diagnostic-only, embedded in exception context).
 */
export const HEADLESS = true;

/**
 * Puppeteer navigation timeout. Shared by
 * SourceDiscoveryService.discoverArchiveCandidates and
 * PropertySalesService's downloadViaBrowser call.
 */
export const BROWSER_TIMEOUT_MS = 60_000;

/**
 * Hosts PSI archive download URLs must resolve to. Shared by
 * SourceDiscoveryService and PropertySalesService (both call
 * assertAllowedDownloadUrl).
 */
export const ALLOWED_DOWNLOAD_HOSTS: readonly string[] = [
  'valuation.property.nsw.gov.au',
  'www.valuergeneral.nsw.gov.au',
  'valuergeneral.nsw.gov.au',
];
