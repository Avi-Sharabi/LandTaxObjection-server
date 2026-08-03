/**
 * Downloads an archive using an already-open browser session.
 *
 * Why this is needed at all rather than a plain HTTP client: the NSW archive
 * host refuses plain HTTP clients outright — a direct Node `fetch` of a
 * weekly ZIP returns `403 text/html`, verified directly (both in the
 * original POC and again in KAN-241's own Phase 0 feasibility spike). The
 * same file fetched by the genuine browser session that was already served
 * the listing succeeds.
 *
 * The transfer is handled by Chrome's own download stack via CDP, so the
 * archive streams to disk and is never buffered in memory.
 *
 * Safety properties (every one of these is preserved from the POC verbatim
 * — this is the highest-risk file in the KAN-241 port):
 * - `behavior: 'allowAndName'` names the file by GUID, so the server's
 *   `Content-Disposition` filename is never used — no path traversal from
 *   an attacker-chosen name.
 * - The GUID is validated before being joined to a path anyway.
 * - Size is capped both from the declared total and from bytes actually
 *   received, and the finished file is re-checked with `stat`.
 * - Writes and deletes stay inside the caller-supplied download directory.
 * - The transfer lands on a `.part` file and is only renamed to the
 *   caller's destination after it validates as a real archive, so a path
 *   the ledger would accept as `downloaded` never exists unless the bytes
 *   behind it are genuine. Every failure path removes the `.part`, leaving
 *   nothing for a later sweep to trip over and nothing to mistake for
 *   source data.
 *
 * Ported from nsw-property-sales-poc/src/download/browser-downloader.ts
 * (KAN-241). Adaptations: error class swap, and the DOWNLOAD_BLOCKED
 * message no longer points at `PSI_STEALTH`/`run --archive <path>` (neither
 * exists in this ticket's scope — stealth is unconditional here, see
 * PsiBrowserService, and there is no manual-archive CLI path).
 */

import { rename, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type { Browser as PuppeteerBrowser } from 'puppeteer';

import { PropertySalesIngestionException } from '../exceptions/property-sales-ingestion.exception';
import { assertDownloadedZip, type ValidatedDownload } from './zip-validator.util';

export interface BrowserDownloadOptions {
  readonly timeoutMs: number;
  readonly maxBytes: number;
}

/**
 * How long to wait after the navigation renders a normal page before
 * concluding that no download was triggered. Short: the download event
 * normally precedes navigation completion.
 */
const NO_DOWNLOAD_GRACE_MS = 3_000;

/** Chrome aborts the navigation when the response turns out to be a download. */
function isDownloadAbort(err: unknown): boolean {
  return err instanceof Error && err.message.includes('net::ERR_ABORTED');
}

/** GUIDs come from Chrome, but they are joined to a path — so verify them. */
function assertSafeGuid(guid: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(guid) || guid === '.' || guid === '..') {
    throw new PropertySalesIngestionException(
      'DOWNLOAD_FAILED',
      `Refusing to use an unsafe download identifier: ${guid}`,
      { context: { guid } },
    );
  }
}

export async function downloadViaBrowser(
  browser: PuppeteerBrowser,
  url: string,
  destinationPath: string,
  options: BrowserDownloadOptions,
): Promise<ValidatedDownload> {
  const downloadDir = resolve(dirname(destinationPath));
  const partialPath = `${destinationPath}.part`;
  const client = await browser.target().createCDPSession();
  const page = await browser.newPage();

  let guid: string | undefined;
  let sawDownload = false;
  let settle: (() => void) | undefined;

  // Cloudflare marks an intercepted request with `cf-mitigated: challenge`.
  // Recording it lets the failure name the real cause instead of guessing.
  let challengedResponse = false;
  const onResponse = (response: { url(): string; headers(): Record<string, string> }): void => {
    if (response.url() !== url) return;
    if ((response.headers()['cf-mitigated'] ?? '').includes('challenge')) challengedResponse = true;
  };
  page.on('response', onResponse);

  /** Resolves with the byte count once Chrome reports the download complete. */
  const completed = new Promise<number>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      rejectPromise(
        new PropertySalesIngestionException(
          'DOWNLOAD_FAILED',
          `Download of ${url} did not complete within ${options.timeoutMs}ms`,
          { context: { url, timeoutMs: options.timeoutMs } },
        ),
      );
    }, options.timeoutMs);

    settle = () => {
      clearTimeout(timer);
    };

    client.on('Browser.downloadWillBegin', (event) => {
      sawDownload = true;
      guid = event.guid;
    });

    client.on('Browser.downloadProgress', (event) => {
      sawDownload = true;
      guid = event.guid;

      const overLimit =
        event.totalBytes > options.maxBytes || event.receivedBytes > options.maxBytes;
      if (overLimit) {
        void client.send('Browser.cancelDownload', { guid: event.guid }).catch(() => {
          // Already finished or gone; the size check below is what matters.
        });
        rejectPromise(
          new PropertySalesIngestionException(
            'DOWNLOAD_TOO_LARGE',
            `Archive exceeds the ${options.maxBytes} byte limit (declared ${event.totalBytes}, received ${event.receivedBytes})`,
            { context: { url, totalBytes: event.totalBytes, receivedBytes: event.receivedBytes } },
          ),
        );
        return;
      }

      if (event.state === 'completed') {
        resolvePromise(event.receivedBytes);
      } else if (event.state === 'canceled') {
        rejectPromise(
          new PropertySalesIngestionException(
            'DOWNLOAD_FAILED',
            `Download of ${url} was canceled by the browser`,
            { context: { url } },
          ),
        );
      }
    });
  });

  try {
    await client.send('Browser.setDownloadBehavior', {
      behavior: 'allowAndName',
      downloadPath: downloadDir,
      eventsEnabled: true,
    });

    // Navigating to the archive turns into a download, which aborts the
    // navigation — that specific abort is the success signal, not a failure.
    let renderedStatus: number | null = null;
    try {
      const response = await page.goto(url, { timeout: options.timeoutMs });
      renderedStatus = response?.status() ?? null;
    } catch (err) {
      if (!isDownloadAbort(err)) throw err;
    }

    // The navigation rendered a document instead of downloading. Give the
    // download event a moment in case of ordering, then fail — a page served in
    // place of the file means the request was intercepted, not fulfilled.
    if (renderedStatus !== null) {
      await new Promise((r) => setTimeout(r, NO_DOWNLOAD_GRACE_MS));
      if (!sawDownload) {
        throw challengedResponse
          ? new PropertySalesIngestionException(
              'DOWNLOAD_BLOCKED',
              `${url} is behind a bot-protection challenge (status ${renderedStatus}, cf-mitigated: challenge). ` +
                'The archive endpoint is challenged separately from the listing page. This pipeline already runs ' +
                'headless with stealth unconditionally (see PsiBrowserService) — if this persists, the challenge ' +
                'has likely escalated beyond what a scoped, evidence-based exception covers, and needs a fresh ' +
                'assessment rather than a config change.',
              { context: { url, status: renderedStatus } },
            )
          : new PropertySalesIngestionException(
              'DOWNLOAD_FAILED',
              `${url} returned a page (status ${renderedStatus}) instead of a file`,
              { context: { url, status: renderedStatus } },
            );
      }
    }

    // Awaited for the completion signal, not for its byte count: the validator
    // stats the file anyway, and Chrome occasionally reports 0 received bytes on
    // an otherwise complete download. The filesystem is the honest source.
    await completed;

    if (guid === undefined) {
      throw new PropertySalesIngestionException(
        'DOWNLOAD_FAILED',
        `Download of ${url} reported no file identifier`,
        { context: { url } },
      );
    }
    assertSafeGuid(guid);

    const downloadedPath = join(downloadDir, guid);
    const finalSize = (await stat(downloadedPath)).size;
    if (finalSize > options.maxBytes) {
      await unlink(downloadedPath).catch(() => undefined);
      throw new PropertySalesIngestionException(
        'DOWNLOAD_TOO_LARGE',
        `Downloaded archive is ${finalSize} bytes, over the ${options.maxBytes} byte limit`,
        { context: { url, finalSize } },
      );
    }

    // Stage under `.part` first: until the bytes are proven to be an archive,
    // nothing may exist at the path the ledger is going to mark `downloaded`.
    await rename(downloadedPath, partialPath);
    const validated = await assertDownloadedZip(partialPath, url);
    await rename(partialPath, destinationPath);

    return validated;
  } catch (err) {
    if (guid !== undefined && /^[A-Za-z0-9._-]+$/.test(guid)) {
      // Best-effort removal of a partial file inside the run's own staging dir.
      await unlink(join(downloadDir, guid)).catch(() => undefined);
    }
    // The `.part` is inside the same caller-supplied directory. Removing it is
    // what keeps a rejected download — a challenge page, a truncated transfer —
    // from being left behind as though it were source data.
    await unlink(partialPath).catch(() => undefined);
    if (err instanceof PropertySalesIngestionException) throw err;
    throw new PropertySalesIngestionException(
      'DOWNLOAD_FAILED',
      `Browser download failed for ${url}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err, context: { url } },
    );
  } finally {
    settle?.();
    page.off('response', onResponse);
    client.removeAllListeners();
    await client.detach().catch(() => undefined);
    await page.close().catch(() => undefined);
  }
}
