import { Injectable, Logger } from '@nestjs/common';
import { mkdir, rename, stat } from 'fs/promises';
import { join } from 'path';
import type { CDPSession, Page } from 'puppeteer';

import { PsiDownloadFailedException } from './exceptions/psi-download-failed.exception';
import { PSI_DOWNLOAD_TIMEOUT_MS, PSI_LOG_TAG } from './psi-import.constant';
import { PsiWeeklyLink } from './types/psi-weekly-link.interface';

interface DownloadProgressEvent {
  readonly guid: string;
  readonly totalBytes: number;
  readonly receivedBytes: number;
  readonly state: 'inProgress' | 'completed' | 'canceled';
}

interface DownloadWillBeginEvent {
  readonly guid: string;
  readonly suggestedFilename: string;
}

@Injectable()
export class PsiDownloadService {
  private readonly logger = new Logger(PsiDownloadService.name);

  /**
   * Downloads one weekly archive into `psi-downloads/<YYYY-MM-DD>/` and returns its path.
   *
   * The download runs *inside* the browser rather than over an HTTP client. The origin sits
   * behind Cloudflare, which fingerprints the TLS/HTTP client itself — replaying the browser's
   * `cf_clearance` cookie, user-agent, Referer and full `sec-ch-*` header set from Node still
   * returns 403. Only a request originating from the real browser session succeeds.
   *
   * Chrome streams the response straight to disk, so nothing is buffered in the Node heap.
   */
  async downloadWeeklyArchive(
    page: Page,
    link: PsiWeeklyLink,
    runDir: string,
  ): Promise<string> {
    await mkdir(runDir, { recursive: true });

    const finalPath = join(runDir, `${link.fileStem}.zip`);
    const existingBytes = await this.fileSize(finalPath);
    if (existingBytes !== null) {
      this.logger.log(
        `${PSI_LOG_TAG}   ${link.label} already downloaded (${this.formatBytes(existingBytes)}) — skipping fetch`,
      );
      return finalPath;
    }

    const cdp = await page.browser().target().createCDPSession();
    try {
      await cdp.send('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: runDir,
        eventsEnabled: true,
      });

      const downloadedName = await this.awaitDownload(cdp, page, link);
      const downloadedPath = join(runDir, downloadedName);

      // Chrome names the file from the server's suggestion; normalise it to the date slug so the
      // run directory is predictable and the "already downloaded" check above stays reliable.
      if (downloadedPath !== finalPath) {
        await rename(downloadedPath, finalPath);
      }
    } catch (err) {
      if (err instanceof PsiDownloadFailedException) throw err;
      throw new PsiDownloadFailedException(
        link.url,
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      await cdp.detach().catch(() => {});
    }

    const bytes = (await this.fileSize(finalPath)) ?? 0;
    this.logger.log(
      `${PSI_LOG_TAG} ↓ ${link.label} — ${this.formatBytes(bytes)} → ${finalPath}`,
    );
    return finalPath;
  }

  /**
   * Triggers the download and resolves with the filename Chrome wrote.
   *
   * Listens for CDP download events rather than polling for `.crdownload` to disappear: the
   * events carry an explicit terminal state, so a cancelled download fails fast instead of
   * waiting out the timeout.
   */
  private awaitDownload(
    cdp: CDPSession,
    page: Page,
    link: PsiWeeklyLink,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let suggestedFilename = `${link.fileStem}.zip`;
      let downloadBegan = false;

      const timer = setTimeout(() => {
        fail(`timed out after ${PSI_DOWNLOAD_TIMEOUT_MS}ms`);
      }, PSI_DOWNLOAD_TIMEOUT_MS);

      const onWillBegin = (event: DownloadWillBeginEvent): void => {
        downloadBegan = true;
        if (event.suggestedFilename)
          suggestedFilename = event.suggestedFilename;
      };

      const onProgress = (event: DownloadProgressEvent): void => {
        if (event.state === 'completed') {
          cleanup();
          resolve(suggestedFilename);
          return;
        }
        if (event.state === 'canceled') {
          fail('the browser cancelled the download');
        }
      };

      function cleanup(): void {
        clearTimeout(timer);
        cdp.off('Browser.downloadWillBegin', onWillBegin);
        cdp.off('Browser.downloadProgress', onProgress);
      }

      function fail(reason: string): void {
        cleanup();
        reject(new PsiDownloadFailedException(link.url, reason));
      }

      cdp.on('Browser.downloadWillBegin', onWillBegin);
      cdp.on('Browser.downloadProgress', onProgress);

      // Navigating to a zip triggers a download instead of a navigation, which Chrome surfaces
      // as a rejected goto (ERR_ABORTED). That rejection is the expected path — the download
      // events above are what actually report the outcome.
      //
      // A goto that RESOLVES means the response rendered as a page instead of downloading, i.e.
      // an error page or a Cloudflare challenge. Fail on that immediately rather than sitting
      // out the full timeout waiting for events that will never arrive.
      page.goto(link.url, { timeout: PSI_DOWNLOAD_TIMEOUT_MS }).then(
        (response) => {
          if (downloadBegan) return;
          const status = response?.status();
          fail(
            status === undefined
              ? 'the URL rendered as a page instead of starting a download'
              : `expected a download but the server returned HTTP ${status}`,
          );
        },
        () => {
          /* ERR_ABORTED — the download started; the CDP events resolve this promise. */
        },
      );
    });
  }

  private async fileSize(path: string): Promise<number | null> {
    try {
      const stats = await stat(path);
      return stats.isFile() ? stats.size : null;
    } catch {
      return null;
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
