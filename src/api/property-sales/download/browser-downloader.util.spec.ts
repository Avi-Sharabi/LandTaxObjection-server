/**
 * Exercises the CDP download path with hand-written fakes for Puppeteer's
 * `Browser`, `CDPSession` and `Page` — no real browser, no network.
 *
 * The two properties under test are the ones a real download cannot be
 * trusted to give us: that nothing appears at the destination path unless
 * the bytes validated, and that a rejected transfer leaves no `.part`
 * behind for the pipeline to mistake for source data.
 *
 * Ported from
 * nsw-property-sales-poc/tests/unit/download/browser-downloader.test.ts
 * (KAN-241).
 */

import { EventEmitter } from 'node:events';
import { access, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Browser as PuppeteerBrowser } from 'puppeteer';

import { downloadViaBrowser, type BrowserDownloadOptions } from './browser-downloader.util';
import { buildSimpleZip } from '../__testing__/zip-builder';

const URL_UNDER_TEST = 'https://example.gov.au/__psi/weekly/20260727.zip';
const GUID = 'fake-download-guid-0001';
const OPTIONS: BrowserDownloadOptions = { timeoutMs: 10_000, maxBytes: 1024 * 1024 };

let dir: string;
let destination: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'psi-browser-download-'));
  destination = join(dir, 'downloaded.zip');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

interface Scenario {
  /** Bytes Chrome "downloads" to its GUID-named file, or null for no download at all. */
  readonly body: Buffer | null;
  /** Status the navigation renders, or null when it aborts into a download. */
  readonly renderedStatus: number | null;
  readonly responseHeaders?: Record<string, string>;
}

/**
 * Builds a fake Browser whose `goto` reproduces one scenario: Chrome either
 * aborts the navigation because it became a download (emitting the CDP
 * progress events and writing the file), or renders a document instead.
 */
function fakeBrowser(scenario: Scenario): PuppeteerBrowser {
  const client = new EventEmitter() as EventEmitter & {
    send: (method: string, params?: unknown) => Promise<unknown>;
    detach: () => Promise<void>;
  };
  client.send = () => Promise.resolve({});
  client.detach = () => Promise.resolve();

  const page = new EventEmitter() as EventEmitter & {
    goto: (url: string, options?: unknown) => Promise<{ status: () => number | null } | null>;
    close: () => Promise<void>;
  };

  page.goto = async (url: string) => {
    // Whatever the outcome, the response headers are observable — this is how
    // the downloader learns about `cf-mitigated: challenge`.
    if (scenario.responseHeaders) {
      page.emit('response', {
        url: () => url,
        headers: () => scenario.responseHeaders,
      });
    }

    if (scenario.body !== null) {
      await writeFile(join(dir, GUID), scenario.body);
      client.emit('Browser.downloadWillBegin', { guid: GUID, url });
      client.emit('Browser.downloadProgress', {
        guid: GUID,
        state: 'completed',
        totalBytes: scenario.body.length,
        receivedBytes: scenario.body.length,
      });
      // Chrome aborts a navigation that turns into a download.
      throw new Error('net::ERR_ABORTED at ' + url);
    }

    return { status: () => scenario.renderedStatus };
  };
  page.close = () => Promise.resolve();

  return {
    target: () => ({ createCDPSession: () => Promise.resolve(client) }),
    newPage: () => Promise.resolve(page),
  } as unknown as PuppeteerBrowser;
}

describe('downloadViaBrowser', () => {
  it('validates before renaming, leaving the archive at the destination and no .part', async () => {
    const zip = buildSimpleZip('A.DAT', 'sale records');
    const browser = fakeBrowser({ body: zip, renderedStatus: null });

    const result = await downloadViaBrowser(browser, URL_UNDER_TEST, destination, OPTIONS);

    expect(result.bytes).toBe(zip.length);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.entryCount).toBe(1);

    expect(await exists(destination)).toBe(true);
    expect(await exists(`${destination}.part`)).toBe(false);
    // Chrome's GUID-named file must not be left lying around either.
    expect(await readdir(dir)).toEqual(['downloaded.zip']);
  });

  it('reports DOWNLOAD_BLOCKED when the response carries cf-mitigated: challenge', async () => {
    const browser = fakeBrowser({
      body: null,
      renderedStatus: 403,
      responseHeaders: { 'cf-mitigated': 'challenge', 'content-type': 'text/html' },
    });

    await expect(downloadViaBrowser(browser, URL_UNDER_TEST, destination, OPTIONS)).rejects.toMatchObject({
      code: 'DOWNLOAD_BLOCKED',
    });

    expect(await exists(destination)).toBe(false);
    expect(await exists(`${destination}.part`)).toBe(false);
  });

  it('cleans up the partial file when a downloaded challenge page fails validation', async () => {
    // The hard case: the transfer *succeeds*, so Chrome reports a completed
    // download — but the bytes are a challenge page, not an archive.
    const challenge = Buffer.from('<!DOCTYPE html><title>Just a moment...</title>');
    const browser = fakeBrowser({ body: challenge, renderedStatus: null });

    await expect(downloadViaBrowser(browser, URL_UNDER_TEST, destination, OPTIONS)).rejects.toMatchObject({
      code: 'DOWNLOAD_BLOCKED',
    });

    expect(await exists(destination)).toBe(false);
    expect(await exists(`${destination}.part`)).toBe(false);
    // Nothing at all survives: no destination, no .part, no GUID file. There is
    // therefore nothing for the pipeline to quarantine as source data.
    expect(await readdir(dir)).toEqual([]);
  });

  it('cleans up the partial file when a truncated archive fails validation', async () => {
    const zip = buildSimpleZip('A.DAT', 'sale records');
    const browser = fakeBrowser({ body: zip.subarray(0, zip.length - 24), renderedStatus: null });

    await expect(downloadViaBrowser(browser, URL_UNDER_TEST, destination, OPTIONS)).rejects.toMatchObject({
      code: 'ARCHIVE_UNREADABLE',
    });

    expect(await readdir(dir)).toEqual([]);
  });

  it('reports DOWNLOAD_FAILED when a page is rendered with no challenge marker', async () => {
    const browser = fakeBrowser({ body: null, renderedStatus: 200 });

    await expect(downloadViaBrowser(browser, URL_UNDER_TEST, destination, OPTIONS)).rejects.toMatchObject({
      code: 'DOWNLOAD_FAILED',
    });

    expect(await readdir(dir)).toEqual([]);
  });

  it('refuses an oversized download without leaving anything behind', async () => {
    const zip = buildSimpleZip('A.DAT', 'x'.repeat(2048));
    const browser = fakeBrowser({ body: zip, renderedStatus: null });

    await expect(
      downloadViaBrowser(browser, URL_UNDER_TEST, destination, { timeoutMs: 10_000, maxBytes: 64 }),
    ).rejects.toMatchObject({ code: 'DOWNLOAD_TOO_LARGE' });

    expect(await exists(destination)).toBe(false);
    expect(await readdir(dir)).toEqual([]);
  });
});
