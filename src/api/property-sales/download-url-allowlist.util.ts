import { ArchiveDownloadException } from './exceptions/archive-download.exception';

/**
 * Guards a candidate archive URL against scheme/host abuse before it's
 * fetched. Called twice per candidate by design, not by accident: once
 * during discovery (filtering out disallowed hosts before a candidate is
 * even considered — source-discovery.service.ts) and again during ingestion
 * (defense-in-depth on the exact same URL/allowlist pair —
 * archive-ingestion.ts), in case a future candidate source ever bypasses
 * discovery's own filter.
 */
export function assertAllowedDownloadUrl(
  url: string,
  allowedHosts: readonly string[],
): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ArchiveDownloadException(
      'DOWNLOAD_FAILED',
      `"${url}" is not a valid URL`,
      { context: { url } },
    );
  }

  if (parsed.protocol !== 'https:') {
    throw new ArchiveDownloadException(
      'DOWNLOAD_FAILED',
      `Refusing to fetch "${url}": scheme must be https, got "${parsed.protocol}"`,
      { context: { url, protocol: parsed.protocol } },
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (!allowedHosts.includes(host)) {
    throw new ArchiveDownloadException(
      'DOWNLOAD_FAILED',
      `Refusing to fetch "${url}": host "${host}" is not on the configured allowlist`,
      { context: { url, host, allowedHosts } },
    );
  }
}
