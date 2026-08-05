import { Injectable, Logger } from '@nestjs/common';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser as PuppeteerBrowser } from 'puppeteer';

import { PropertySalesConfig } from './property-sales.config';

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

    return (
      puppeteerExtra as unknown as {
        launch: (opts: unknown) => Promise<PuppeteerBrowser>;
      }
    ).launch({
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
