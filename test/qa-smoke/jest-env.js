'use strict';

// Custom Puppeteer test environment that swallows Chrome teardown errors.
//
// After a long run Chrome's CDP connection can close before Jest calls
// PuppeteerEnvironment.teardown(). The resulting ConnectionClosedError causes
// Jest to mark the ENTIRE suite as "failed to run" and discard all test results.
// Wrapping teardown() in a try/catch lets Jest collect and report the actual results.

const { TestEnvironment: PuppeteerEnvironment } = require('jest-environment-puppeteer');

class SafePuppeteerEnvironment extends PuppeteerEnvironment {
  async teardown() {
    try {
      await super.teardown();
    } catch (err) {
      // Swallow CDP/Chrome teardown errors so Jest can still write test results.
      // These errors don't affect whether tests passed or failed.
      process.stderr.write(`[jest-env] teardown error swallowed: ${err.message}\n`);
    }
  }
}

module.exports = SafePuppeteerEnvironment;
