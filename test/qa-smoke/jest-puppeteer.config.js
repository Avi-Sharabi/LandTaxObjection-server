'use strict';

require('dotenv').config();

module.exports = {
  launch: {
    headless: process.env.HEADLESS === 'false'
      ? false
      : (process.env.CI || process.env.HEADLESS === 'true') ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080',
    ],
    defaultViewport: { width: 1920, height: 1080 },
    slowMo: parseInt(process.env.SLOW_MO || '20'),
    // Client-side timeout ceiling, not a floor — gives headroom before a genuine
    // hang is reported without slowing anything down for fast-running tests.
    protocolTimeout: 180000,
  },
};
