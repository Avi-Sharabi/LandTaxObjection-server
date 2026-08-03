/**
 * Dedicated Puppeteer launcher for the property-sales download pipeline.
 *
 * Deliberately NOT a reuse of
 * src/api/supporting-evidence/shared/puppeteer.service.ts, for three
 * reasons:
 *
 *  1. That service's `launch()` passes `--single-process`, and its own
 *     `launchForPdf()` exists specifically because `--single-process`
 *     "crashes the renderer on large PDF payloads" (see that file's comment
 *     at its `launchForPdf` method) — a multi-hundred-KB/MB ZIP moving
 *     through Chrome's download stack via CDP is the same failure shape.
 *  2. Reusing it would mean editing a service the supporting-evidence and
 *     objection-package pipelines depend on today — exactly the disruption
 *     this ticket must avoid.
 *  3. Different lifecycle: a sweep's browser session is longer-lived than a
 *     single screenshot/PDF render.
 *
 * Stealth is applied the same way that service already does —
 * `puppeteer-extra`'s `.use(StealthPlugin())` registers on the shared
 * `puppeteer-extra` singleton and dedupes plugins by name, so calling it
 * again here is idempotent and does not introduce a second, conflicting
 * global side effect. KAN-241's own Phase 0 feasibility spike verified
 * directly that headless + stealth reaches the real NSW listing (no
 * Cloudflare challenge) and that a CDP download of a live weekly archive
 * succeeds without `--single-process`.
 *
 * Unlike the POC's `PSI_STEALTH` (opt-in, off by default), stealth is
 * unconditional here: this repo's existing Puppeteer usage already runs
 * headless + stealth in production with no toggle, and the spike confirmed
 * the same posture works for this source.
 */

import { Injectable, Logger } from '@nestjs/common';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser as PuppeteerBrowser } from 'puppeteer';

import { PropertySalesConfig } from '../property-sales.config';

puppeteerExtra.use(StealthPlugin());

@Injectable()
export class PsiBrowserService {
  private readonly logger = new Logger(PsiBrowserService.name);

  constructor(private readonly config: PropertySalesConfig) {}

  async launch(): Promise<PuppeteerBrowser> {
    this.logger.log(
      JSON.stringify({
        context: 'PsiBrowser.launch',
        headless: this.config.headless,
        ts: new Date().toISOString(),
      }),
    );

    return (puppeteerExtra as unknown as { launch: (opts: unknown) => Promise<PuppeteerBrowser> }).launch({
      headless: this.config.headless,
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
      ],
    });
  }
}
