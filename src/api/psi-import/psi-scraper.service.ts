import { Injectable, Logger } from '@nestjs/common';
import { basename } from 'path';
import type { Page } from 'puppeteer';

import { PsiListingUnavailableException } from './exceptions/psi-listing-unavailable.exception';
import {
  PSI_LISTING_URL,
  PSI_LOG_TAG,
  PSI_PAGE_TIMEOUT_MS,
  PSI_WEEKLY_PANEL_SELECTOR,
} from './psi-import.constant';
import {
  PsiListingResult,
  PsiWeeklyLink,
} from './types/psi-weekly-link.interface';

@Injectable()
export class PsiScraperService {
  private readonly logger = new Logger(PsiScraperService.name);

  /**
   * Loads the VG bulk PSI listing and returns the weekly links published since `referenceLabel`,
   * newest first.
   *
   * Takes a caller-owned `Page` rather than launching its own browser: the same session has to
   * carry through to the download step, because the origin's Cloudflare protection only honours
   * requests made from within the browser that solved its challenge.
   *
   * @param referenceLabel the `DD MMM YYYY` rendering of the newest `download_datetime` already
   *                       imported, or null when the table is empty (every link is returned).
   */
  async findWeeklyDownloads(
    page: Page,
    referenceLabel: string | null,
  ): Promise<PsiListingResult> {
    await page.goto(PSI_LISTING_URL, {
      waitUntil: 'networkidle2',
      timeout: PSI_PAGE_TIMEOUT_MS,
    });

    const anchors = await this.readWeeklyAnchors(page);
    if (anchors.length === 0) {
      throw new PsiListingUnavailableException(
        `no anchors matched "${PSI_WEEKLY_PANEL_SELECTOR}" — the page markup has probably changed`,
      );
    }

    return {
      links: this.selectNewerThan(anchors, referenceLabel),
      totalAnchors: anchors.length,
    };
  }

  private async readWeeklyAnchors(page: Page): Promise<PsiWeeklyLink[]> {
    const raw = await page.evaluate((selector: string) => {
      return Array.from(
        document.querySelectorAll<HTMLAnchorElement>(selector),
      ).map((anchor) => ({
        url: anchor.href,
        label: (anchor.textContent ?? '').trim(),
      }));
    }, PSI_WEEKLY_PANEL_SELECTOR);

    return raw.map((anchor) => ({
      ...anchor,
      fileStem: basename(new URL(anchor.url).pathname, '.zip'),
    }));
  }

  /**
   * Walks the panel backwards from the newest entry, collecting links until it reaches the week
   * already held, and returns them newest-first.
   *
   * Matching is plain string equality on the rendered label — the reference is formatted into the
   * site's own `DD MMM YYYY` form before it gets here, so nothing on this path parses a date.
   *
   * This does rely on the panel rendering oldest-first, which is how it renders today. The full
   * rendered order is logged on every run, so a change at VG's end shows up in the logs rather
   * than silently reversing the walk.
   */
  private selectNewerThan(
    anchors: PsiWeeklyLink[],
    referenceLabel: string | null,
  ): PsiWeeklyLink[] {
    this.logger.log(
      `${PSI_LOG_TAG} Listing order as rendered: ${anchors.map((a) => a.label).join(', ')}`,
    );

    const newestFirst = [...anchors].reverse();
    if (referenceLabel === null) return newestFirst;

    const selected: PsiWeeklyLink[] = [];
    for (const link of newestFirst) {
      if (link.label === referenceLabel) return selected;
      selected.push(link);
    }

    // Falling out of the loop means the reference week is no longer listed — the table is further
    // behind than the page reaches back. Everything on offer is new, but say so, because it also
    // means some weeks are gone from the site entirely and cannot be recovered from here.
    this.logger.warn(
      `${PSI_LOG_TAG} Reference week "${referenceLabel}" is not on the page — it only goes back to "${newestFirst[newestFirst.length - 1].label}". Taking all ${selected.length}; anything older is no longer published.`,
    );
    return selected;
  }
}
