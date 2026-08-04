'use strict';

const fs = require('fs');
const path = require('path');

// Formats a count breakdown the same way Jest's own console summary does: only
// non-zero segments shown, in "failed, skipped, todo, passed, total" order.
function summarizeCounts(failed, pending, passed, total, todo = 0) {
  const parts = [];
  if (failed > 0) parts.push(`${failed} failed`);
  if (pending > 0) parts.push(`${pending} skipped`);
  if (todo > 0) parts.push(`${todo} todo`);
  parts.push(`${passed} passed`);
  parts.push(`${total} total`);
  return parts.join(', ');
}

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

    // Jest-native-style aggregate summary (matches the block Jest itself prints to the
    // console), so the same clean report also carries the familiar totals at a glance.
    // Note: the "estimated Ns" figure Jest sometimes shows is its own internal cache-based
    // heuristic — not derivable from the reporter's results object, so it's omitted here.
    const suiteSummary = summarizeCounts(
      results.numFailedTestSuites, results.numPendingTestSuites,
      results.numPassedTestSuites, results.numTotalTestSuites
    );
    const testSummary = summarizeCounts(
      results.numFailedTests, results.numPendingTests,
      results.numPassedTests, results.numTotalTests, results.numTodoTests
    );
    const elapsedSeconds = ((Date.now() - results.startTime) / 1000).toFixed(3);

    lines.push(`Test Suites: ${suiteSummary}`);
    lines.push(`Tests:       ${testSummary}`);
    lines.push(`Snapshots:   ${results.snapshot.total} total`);
    lines.push(`Time:        ${elapsedSeconds} s`);

    const report = lines.join('\n');
    fs.writeFileSync(this._outputFile, report, 'utf8');

    // Also print the same report to the console, after Jest's own summary — so it's
    // visible directly in the terminal without having to open failed-tests.txt separately.
    process.stdout.write(`\n=== ${path.basename(this._outputFile)} ===\n${report}\n`);
  }
}

module.exports = FailureReporter;
