import { Injectable, Logger } from '@nestjs/common';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser as PuppeteerBrowser } from 'puppeteer';

import { HEADLESS } from './property-sales.constants';

puppeteerExtra.use(StealthPlugin());

@Injectable()
export class PsiBrowserService {
  private readonly logger = new Logger(PsiBrowserService.name);

  async launch(): Promise<PuppeteerBrowser> {
    this.logger.log(
      JSON.stringify({
        context: 'PsiBrowser.launch',
        headless: HEADLESS,
        ts: new Date().toISOString(),
      }),
    );

    return (
      puppeteerExtra as unknown as {
        launch: (opts: unknown) => Promise<PuppeteerBrowser>;
      }
    ).launch({
      headless: HEADLESS,
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
