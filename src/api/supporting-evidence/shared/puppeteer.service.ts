import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';

puppeteer.use(StealthPlugin());

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

@Injectable()
export class PuppeteerService {
  private readonly logger = new Logger(PuppeteerService.name);

  async launch(): Promise<Browser> {
    return (puppeteer as unknown as { launch: (opts: unknown) => Promise<Browser> }).launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--js-flags=--max-old-space-size=512',
      ],
    });
  }

  // --single-process detaches the frame mid-navigation ("Navigating frame was detached") on the
  // Cloudflare-fronted Valuer General origin, so the PSI import gets its own launcher. Measured
  // against the live listing: with the flag, page.goto fails every time; without it, the page
  // loads in ~2.4s. Everything else matches launch(), including the 512 MB heap cap — the import
  // shares a container with this browser and streams a hundred-plus files per week.
  async launchForPsi(): Promise<Browser> {
    return (puppeteer as unknown as { launch: (opts: unknown) => Promise<Browser> }).launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--js-flags=--max-old-space-size=512',
      ],
    });
  }

  // --single-process crashes the renderer on large PDF payloads; use a separate process for PDF rendering
  async launchForPdf(): Promise<Browser> {
    return (puppeteer as unknown as { launch: (opts: unknown) => Promise<Browser> }).launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--disable-extensions',
      ],
    });
  }

  async capturePortalScreenshot(address: string, propId: string, browser: Browser): Promise<string | null> {
    this.logger.log('Loading Spatial Viewer for screenshot');
    let page: Page | null = null;
    try {
      page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      await page.goto('https://www.planningportal.nsw.gov.au/spatialviewer/#/find-a-property/address', {
        waitUntil: 'networkidle2',
        timeout: 45000,
      });

      try {
        await page.waitForFunction(
          () => Array.from(document.querySelectorAll('button')).some(b => /i agree/i.test(b.textContent || '')),
          { timeout: 8000 },
        );
        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => /i agree/i.test(b.textContent || ''));
          if (btn) (btn as HTMLButtonElement).click();
        });
        await sleep(2000);
      } catch { /* no modal */ }

      await page.waitForSelector('#mat-input-0', { timeout: 20000 });
      await sleep(1500);
      await page.click('#mat-input-0');
      await page.type('#mat-input-0', address, { delay: 80 });
      await page.waitForSelector('.mat-autocomplete-panel.mat-autocomplete-visible mat-option', { timeout: 15000 });
      await sleep(800);

      const streetKey = address.split(',')[0].toUpperCase().trim();
      await page.evaluate((key: string) => {
        const opts = Array.from(document.querySelectorAll('mat-option .mat-option-text'));
        const match = opts.find(o => o.textContent?.toUpperCase().includes(key)) || opts[0];
        if (match) (match.closest('mat-option') as HTMLElement)?.click();
      }, streetKey);

      await sleep(4000);
      try {
        await page.evaluate(() => {
          const b = document.querySelector('button[data-target="#layersList"]');
          if (b) (b as HTMLButtonElement).click();
        });
        await sleep(600);
      } catch { /* panel not present */ }
      try {
        await page.evaluate(() => {
          const b = document.querySelector('button[data-target="#rightPanel"]');
          if (b) (b as HTMLButtonElement).click();
        });
        await sleep(600);
      } catch { /* panel not present */ }
      try {
        const mapEl = await page.$('canvas') ?? await page.$('.esri-view-surface') ?? await page.$('#map');
        if (mapEl) {
          const box = await mapEl.boundingBox();
          if (box) {
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.wheel({ deltaY: 300 });
          }
        }
      } catch { /* zoom failed */ }
      try {
        await page.waitForFunction(
          () => !document.body.innerText.includes('Fetching results for your search'),
          { timeout: 30000 },
        );
      } catch { /* timed out — proceed anyway */ }
      await sleep(5000);
      const buf = await page.screenshot({ encoding: 'base64' }) as string;
      this.logger.log(`Portal screenshot captured for ${propId}`);
      return buf;
    } catch (e: unknown) {
      this.logger.warn(`Portal screenshot failed: ${(e as Error).message}`);
      return null;
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  async renderHtmlToPdfBuffer(html: string, browser: Browser): Promise<Buffer> {
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
      });
      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => {});
    }
  }

  async captureCloseupSatellite(lat: number, lng: number, browser: Browser): Promise<string | null> {
    let page: Page | null = null;
    try {
      page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.goto(`https://www.google.com/maps/@${lat},${lng},19z/data=!3m1!1e3`, { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(4000);
      const buf = await page.screenshot({ encoding: 'base64' }) as string;
      this.logger.log('Satellite closeup (z19) captured');
      return buf;
    } catch (e: unknown) {
      this.logger.warn(`Satellite closeup failed: ${(e as Error).message}`);
      return null;
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  async captureContextSatellite(lat: number, lng: number, browser: Browser): Promise<string | null> {
    let page: Page | null = null;
    try {
      page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.goto(`https://www.google.com/maps/@${lat},${lng},15z/data=!3m1!1e3`, { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(4000);
      const buf = await page.screenshot({ encoding: 'base64' }) as string;
      this.logger.log('Satellite context (z15) captured');
      return buf;
    } catch (e: unknown) {
      this.logger.warn(`Satellite context failed: ${(e as Error).message}`);
      return null;
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }
}
