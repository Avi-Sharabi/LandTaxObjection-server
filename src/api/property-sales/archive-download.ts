import { open, rename, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type {
  Browser as PuppeteerBrowser,
  Page as PuppeteerPage,
} from 'puppeteer';

import { ArchiveDownloadException } from './exceptions/archive-download.exception';

const ZIP_LOCAL_FILE_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

function looksLikeHtml(head: Buffer): boolean {
  const withoutBom = head.subarray(0, UTF8_BOM.length).equals(UTF8_BOM)
    ? head.subarray(UTF8_BOM.length)
    : head;
  const text = withoutBom.toString('latin1').trimStart().toLowerCase();
  return (
    text.startsWith('<!doctype') ||
    text.startsWith('<html') ||
    text.startsWith('<!--')
  );
}

async function readHead(
  path: string,
  length: number,
): Promise<{ head: Buffer; size: number }> {
  const handle = await open(path, 'r');
  try {
    const { size } = await handle.stat();
    const buffer = Buffer.alloc(Math.min(length, size));
    if (buffer.length > 0) {
      await handle.read(buffer, 0, buffer.length, 0);
    }
    return { head: buffer, size };
  } finally {
    await handle.close();
  }
}

async function assertZipSignature(path: string, url: string): Promise<void> {
  const { head, size } = await readHead(path, 64);

  if (size === 0) {
    throw new ArchiveDownloadException(
      'DOWNLOAD_FAILED',
      `Download of ${url} produced an empty file`,
      { context: { url, bytes: 0 } },
    );
  }

  if (
    !head
      .subarray(0, ZIP_LOCAL_FILE_HEADER.length)
      .equals(ZIP_LOCAL_FILE_HEADER)
  ) {
    const signature = head
      .subarray(0, ZIP_LOCAL_FILE_HEADER.length)
      .toString('hex');

    if (looksLikeHtml(head)) {
      throw new ArchiveDownloadException(
        'DOWNLOAD_BLOCKED',
        `${url} returned an HTML document in place of the archive (${size} bytes, signature ${signature}). ` +
          'This is a bot-protection challenge served as an attachment rather than the file itself. ' +
          'The download was discarded — confirm HEADLESS/stealth configuration in property-sales.constants.ts.',
        { context: { url, bytes: size, signature } },
      );
    }

    throw new ArchiveDownloadException(
      'DOWNLOAD_FAILED',
      `${url} did not return a ZIP archive: expected signature 504b0304, got ${signature} (${size} bytes)`,
      { context: { url, bytes: size, signature } },
    );
  }
}

export interface BrowserDownloadOptions {
  readonly navigationTimeoutMs: number;
  readonly timeoutMs: number;
  readonly maxBytes: number;
}

const NO_DOWNLOAD_GRACE_MS = 3_000;

function isDownloadAbort(err: unknown): boolean {
  return err instanceof Error && err.message.includes('net::ERR_ABORTED');
}

function isSafeGuid(guid: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(guid) && guid !== '.' && guid !== '..';
}

function assertSafeGuid(guid: string): void {
  if (!isSafeGuid(guid)) {
    throw new ArchiveDownloadException(
      'DOWNLOAD_FAILED',
      `Refusing to use an unsafe download identifier: ${guid}`,
      { context: { guid } },
    );
  }
}

export interface DownloadSession {
  download(
    url: string,
    destinationPath: string,
    options: BrowserDownloadOptions,
  ): Promise<void>;
  close(): Promise<void>;
}

/**
 * Opens one CDP session against `browser`'s browser-target, reused across
 * every archive in an archive sync so downloading N archives costs one Page
 * + one CDP session instead of N of each (see
 * PropertySalesService.runArchiveSync, which creates `page` once for the
 * whole archive sync and passes it here). Call `close()` once after the
 * last `download()`.
 */
export async function openDownloadSession(
  browser: PuppeteerBrowser,
  page: PuppeteerPage,
): Promise<DownloadSession> {
  const client = await browser.target().createCDPSession();

  return {
    async download(url, destinationPath, options) {
      const downloadDir = resolve(dirname(destinationPath));
      const partialPath = `${destinationPath}.part`;

      let guid: string | undefined;
      let sawDownload = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;

      let challengedResponse = false;
      const onResponse = (response: {
        url(): string;
        headers(): Record<string, string>;
      }): void => {
        if (response.url() !== url) return;
        if ((response.headers()['cf-mitigated'] ?? '').includes('challenge'))
          challengedResponse = true;
      };
      page.on('response', onResponse);

      const completed = new Promise<void>((resolvePromise, rejectPromise) => {
        timeout = setTimeout(() => {
          rejectPromise(
            new ArchiveDownloadException(
              'DOWNLOAD_FAILED',
              `Download of ${url} did not complete within ${options.timeoutMs}ms`,
              { context: { url, timeoutMs: options.timeoutMs } },
            ),
          );
        }, options.timeoutMs);

        client.on('Browser.downloadWillBegin', (event) => {
          sawDownload = true;
          guid = event.guid;
        });

        client.on('Browser.downloadProgress', (event) => {
          sawDownload = true;
          guid = event.guid;

          const overLimit =
            event.totalBytes > options.maxBytes ||
            event.receivedBytes > options.maxBytes;
          if (overLimit) {
            void client
              .send('Browser.cancelDownload', { guid: event.guid })
              .catch(() => {});
            rejectPromise(
              new ArchiveDownloadException(
                'DOWNLOAD_TOO_LARGE',
                `Archive exceeds the ${options.maxBytes} byte limit (declared ${event.totalBytes}, received ${event.receivedBytes})`,
                {
                  context: {
                    url,
                    totalBytes: event.totalBytes,
                    receivedBytes: event.receivedBytes,
                  },
                },
              ),
            );
            return;
          }

          if (event.state === 'completed') {
            resolvePromise();
          } else if (event.state === 'canceled') {
            rejectPromise(
              new ArchiveDownloadException(
                'DOWNLOAD_FAILED',
                `Download of ${url} was canceled by the browser`,
                { context: { url } },
              ),
            );
          }
        });
      });

      // `completed` is awaited below, but its timer is armed now and can fire while
      // we are still awaiting the navigation. An orphaned rejection would terminate
      // the process, so keep a handler attached for the whole lifetime. Awaiting it
      // later still observes the same rejection.
      void completed.catch(() => undefined);

      try {
        await client.send('Browser.setDownloadBehavior', {
          behavior: 'allowAndName',
          downloadPath: downloadDir,
          eventsEnabled: true,
        });

        let renderedStatus: number | null = null;
        try {
          const response = await page.goto(url, {
            timeout: options.navigationTimeoutMs,
          });
          renderedStatus = response?.status() ?? null;
        } catch (err) {
          if (!isDownloadAbort(err)) throw err;
        }

        if (renderedStatus !== null) {
          await new Promise((r) => setTimeout(r, NO_DOWNLOAD_GRACE_MS));
          if (!sawDownload) {
            throw challengedResponse
              ? new ArchiveDownloadException(
                  'DOWNLOAD_BLOCKED',
                  `${url} is behind a bot-protection challenge (status ${renderedStatus}, cf-mitigated: challenge). ` +
                    'The archive endpoint is challenged separately from the listing page. This pipeline already runs ' +
                    'headless with stealth unconditionally (see PsiBrowserService) — if this persists, the ' +
                    'challenge has likely escalated beyond what a scoped, evidence-based exception covers.',
                  { context: { url, status: renderedStatus } },
                )
              : new ArchiveDownloadException(
                  'DOWNLOAD_FAILED',
                  `${url} returned a page (status ${renderedStatus}) instead of a file`,
                  { context: { url, status: renderedStatus } },
                );
          }
        }

        await completed;

        if (guid === undefined) {
          throw new ArchiveDownloadException(
            'DOWNLOAD_FAILED',
            `Download of ${url} reported no file identifier`,
            { context: { url } },
          );
        }
        assertSafeGuid(guid);

        const downloadedPath = join(downloadDir, guid);
        const finalSize = (await stat(downloadedPath)).size;
        if (finalSize > options.maxBytes) {
          throw new ArchiveDownloadException(
            'DOWNLOAD_TOO_LARGE',
            `Downloaded archive is ${finalSize} bytes, over the ${options.maxBytes} byte limit`,
            { context: { url, finalSize } },
          );
        }

        await rename(downloadedPath, partialPath);
        await assertZipSignature(partialPath, url);
        await rename(partialPath, destinationPath);
      } catch (err) {
        if (guid !== undefined && isSafeGuid(guid)) {
          await unlink(join(downloadDir, guid)).catch(() => undefined);
        }

        await unlink(partialPath).catch(() => undefined);
        if (err instanceof ArchiveDownloadException) throw err;
        throw new ArchiveDownloadException(
          'DOWNLOAD_FAILED',
          `Browser download failed for ${url}: ${err instanceof Error ? err.message : String(err)}`,
          { cause: err, context: { url } },
        );
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
        page.off('response', onResponse);
        // Scoped to this download only — nothing else attaches listeners to
        // this session's client between calls, so clearing all of them here
        // is safe and leaves the client ready for the next archive.
        client.removeAllListeners();
      }
    },

    async close() {
      await client.detach().catch(() => undefined);
    },
  };
}
