'use strict';

const fs = require('fs');
const path = require('path');

// Writes a plain-text summary of failed tests after the run, so a failure can be
// scanned without scrolling back through the full console output.
class FailureReporter {
  constructor(globalConfig, options) {
    this._outputFile = (options && options.outputFile) || path.join(__dirname, 'failed-tests.txt');
  }

  onRunComplete(contexts, results) {
    const lines = [];
    lines.push(`Test run: ${new Date().toISOString()}`);
    lines.push(`Total: ${results.numTotalTests} | Passed: ${results.numPassedTests} | Failed: ${results.numFailedTests} | Skipped: ${results.numPendingTests}`);
    lines.push('');

    if (results.numFailedTests === 0) {
      lines.push('No failed tests.');
    } else {
      lines.push('Failed tests:');
      lines.push('');
      for (const suite of results.testResults) {
        const failedInSuite = suite.testResults.filter(t => t.status === 'failed');
        if (failedInSuite.length === 0) continue;

        lines.push(`File: ${path.relative(process.cwd(), suite.testFilePath)}`);
        for (const t of failedInSuite) {
          lines.push(`  - ${t.fullName}`);
          for (const msg of t.failureMessages) {
            lines.push(`      ${msg.split('\n')[0]}`);
          }
        }
        lines.push('');
      }
    }

    fs.writeFileSync(this._outputFile, lines.join('\n'), 'utf8');
  }
}

module.exports = FailureReporter;
