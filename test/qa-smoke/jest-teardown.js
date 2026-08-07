'use strict';

// Custom global teardown — wraps jest-environment-puppeteer's teardown so that
// lockfile/EBUSY-style errors (Chrome profile still locked) don't cause Jest
// to exit with a non-zero code and discard test results.

const originalTeardown = require('jest-environment-puppeteer/teardown');

module.exports = async function globalTeardown(globalConfig) {
  try {
    await originalTeardown(globalConfig);
  } catch (err) {
    process.stderr.write(`[jest-teardown] global teardown error swallowed: ${err.message}\n`);
  }
};
