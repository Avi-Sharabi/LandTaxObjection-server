/**
 * Validates a discovered or configured URL before it is ever fetched.
 *
 * This is the SSRF guard: a link scraped from a web page is untrusted input.
 * Without this check, a compromised or malicious discovery page could point
 * the downloader at an internal service (`http://169.254.169.254/...`,
 * `http://localhost:5432/...`) instead of the real NSW archive host.
 *
 * Ported verbatim from nsw-property-sales-poc/src/download/url-guard.ts
 * (KAN-241) — only the error class changed.
 */

import { PropertySalesIngestionException } from '../exceptions/property-sales-ingestion.exception';

export function assertAllowedDownloadUrl(url: string, allowedHosts: readonly string[]): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new PropertySalesIngestionException('DOWNLOAD_SCHEME_NOT_ALLOWED', `"${url}" is not a valid URL`, {
      context: { url },
    });
  }

  if (parsed.protocol !== 'https:') {
    throw new PropertySalesIngestionException(
      'DOWNLOAD_SCHEME_NOT_ALLOWED',
      `Refusing to fetch "${url}": scheme must be https, got "${parsed.protocol}"`,
      { context: { url, protocol: parsed.protocol } },
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (!allowedHosts.includes(host)) {
    throw new PropertySalesIngestionException(
      'DOWNLOAD_HOST_NOT_ALLOWED',
      `Refusing to fetch "${url}": host "${host}" is not on the configured allowlist`,
      { context: { url, host, allowedHosts } },
    );
  }

  return parsed;
}
