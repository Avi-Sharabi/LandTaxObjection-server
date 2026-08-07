'use strict';

module.exports = {
  preset: 'jest-puppeteer',
  testEnvironment: './jest-env.js',
  globalTeardown: './jest-teardown.js',
  testMatch: ['**/*.test.js'],
  testTimeout: 60000,
  verbose: true,
  forceExit: true,
  reporters: ['default', './failure-reporter.js'],
};
