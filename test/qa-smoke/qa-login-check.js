'use strict';

const puppeteer = require('puppeteer-extra');

const QA_URL = process.env.QA_FRONTEND_URL || 'https://qa.landtax.ymlgroup.com.au';
const EMAIL = process.env.QA_TEST_EMAIL;
const PASSWORD = process.env.QA_TEST_PASSWORD;

(async () => {
  if (!EMAIL || !PASSWORD) {
    console.error('QA_TEST_EMAIL and QA_TEST_PASSWORD env vars are required');
    process.exit(1);
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    const page = await browser.newPage();
    await page.goto(`${QA_URL}/login`, { waitUntil: 'networkidle0', timeout: 30000 });

    await page.type('input[name="email"]', EMAIL);
    await page.type('input[name="password"]', PASSWORD);

    await Promise.all([
      page.waitForFunction(() => window.location.pathname.includes('/dashboard'), { timeout: 15000 }),
      page.click('[data-testid="login-submit-btn"]'),
    ]);

    const url = page.url();
    if (!url.includes('/accountant/dashboard')) {
      throw new Error(`Expected to reach /accountant/dashboard, got: ${url}`);
    }

    console.log('QA login smoke check PASSED:', url);
    await browser.close();
    process.exit(0);
  } catch (err) {
    if (browser) await browser.close();
    console.error('QA login smoke check FAILED:', err.message);
    process.exit(1);
  }
})().catch(err => {
  console.error('QA login smoke check FAILED (unhandled):', err.message);
  process.exit(1);
});
