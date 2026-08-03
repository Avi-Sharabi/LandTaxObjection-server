/**
 * A narrow structural subset of Puppeteer's real `Page`/`Frame` types, so
 * `SourceDiscoveryService` is fully unit-testable with hand-written fakes
 * over saved HTML fixtures, independent of an actual browser or network
 * access.
 *
 * Ported from nsw-property-sales-poc/src/discovery/source-discovery.ts
 * (KAN-241) — `DiscoveryPage`/`DiscoveryFrame`/`wrapPage` only; the POC's
 * `DiscoveryBrowser`/`BrowserLauncher`/`launchRealBrowser` are not ported —
 * this module's orchestrator (property-sales-download.service.ts) sequences
 * `PsiBrowserService.launch()` → `wrapPage()` → `discoverArchiveCandidates()`
 * → `downloadViaBrowser()` directly, so that extra indirection layer isn't
 * needed here.
 */

import type { Page as PuppeteerPage } from 'puppeteer';

/** A document within the page — the main frame or any child frame. */
export interface DiscoveryFrame {
  url(): string;
  content(): Promise<string>;
}

export interface DiscoveryPage {
  goto(
    url: string,
    options: { waitUntil: 'networkidle2'; timeout: number },
  ): Promise<{ status: number | null }>;
  title(): Promise<string>;
  url(): string;
  /** Includes the main frame first, matching Puppeteer's own ordering. */
  frames(): DiscoveryFrame[];
}

/**
 * Adapts a real Puppeteer `Page` to the narrow `DiscoveryPage` contract.
 * Required, not merely convenient: Puppeteer's real `page.goto()` resolves
 * `HTTPResponse | null`, which is not structurally assignable to
 * `{ status: number | null }` — the object shape our discovery logic
 * actually needs — so this adapter is what bridges the two.
 *
 * Deliberately exposes nothing beyond `goto`/`title`/`url`/`frames` — in
 * particular no `setUserAgent`: the browser's genuine User-Agent must stay
 * untouched (see PsiBrowserService), and narrowing the type here makes an
 * accidental override a compile error, not just a policy someone has to
 * remember.
 */
export function wrapPage(page: PuppeteerPage): DiscoveryPage {
  return {
    goto: async (url, options) => {
      const response = await page.goto(url, options);
      return { status: response?.status() ?? null };
    },
    title: () => page.title(),
    url: () => page.url(),
    frames: () =>
      page.frames().map((frame) => ({
        url: () => frame.url(),
        content: () => frame.content(),
      })),
  };
}
