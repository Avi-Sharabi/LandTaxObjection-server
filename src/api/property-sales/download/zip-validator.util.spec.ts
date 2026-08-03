import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assertDownloadedZip } from './zip-validator.util';
import { buildSimpleZip, buildZip } from '../__testing__/zip-builder';

const URL_UNDER_TEST = 'https://example.gov.au/__psi/weekly/20260727.zip';

let dir: string;
let target: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'psi-zip-validator-'));
  target = join(dir, 'downloaded.zip');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Digest computed independently of the implementation under test. */
function sha256Of(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('assertDownloadedZip', () => {
  it('accepts a real ZIP, reporting its size, digest and entry count', async () => {
    const zip = buildZip([
      { name: 'A.DAT', content: 'a' },
      { name: 'B.DAT', content: 'b' },
    ]);
    await writeFile(target, zip);

    const result = await assertDownloadedZip(target, URL_UNDER_TEST);

    expect(result.bytes).toBe(zip.length);
    expect(result.sha256).toBe(sha256Of(zip));
    expect(result.entryCount).toBe(2);
  });

  it('rejects an HTML challenge disguised as a ZIP with DOWNLOAD_BLOCKED', async () => {
    const challenge =
      '<!DOCTYPE html><html><head><title>Just a moment...</title></head>' +
      '<body>Checking your browser before accessing the site.</body></html>';
    await writeFile(target, challenge, 'utf8');

    await expect(assertDownloadedZip(target, URL_UNDER_TEST)).rejects.toMatchObject({
      code: 'DOWNLOAD_BLOCKED',
    });
  });

  it('recognises an HTML body that leads with a BOM or whitespace', async () => {
    // A challenge page is not obliged to start its response at byte 0 with `<`.
    await writeFile(target, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('\n  <html><body>nope</body></html>')]));

    await expect(assertDownloadedZip(target, URL_UNDER_TEST)).rejects.toMatchObject({
      code: 'DOWNLOAD_BLOCKED',
    });
  });

  it('rejects a non-ZIP, non-HTML body as DOWNLOAD_FAILED, not as a challenge', async () => {
    // Distinguishing this from DOWNLOAD_BLOCKED is the point: a corrupt or
    // unexpected payload is not evidence of bot protection.
    await writeFile(target, Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]));

    await expect(assertDownloadedZip(target, URL_UNDER_TEST)).rejects.toMatchObject({
      code: 'DOWNLOAD_FAILED',
    });
  });

  it('rejects an empty file', async () => {
    await writeFile(target, Buffer.alloc(0));

    await expect(assertDownloadedZip(target, URL_UNDER_TEST)).rejects.toMatchObject({
      code: 'DOWNLOAD_FAILED',
    });
  });

  it('rejects a truncated archive that still carries a valid ZIP signature', async () => {
    // The signature check alone would pass this: the first four bytes are
    // genuinely `PK\x03\x04`. Only walking the central directory catches it.
    const zip = buildSimpleZip('A.DAT', 'some content here');
    const truncated = zip.subarray(0, zip.length - 24);
    expect(truncated.subarray(0, 4).toString('hex')).toBe('504b0304');
    await writeFile(target, truncated);

    await expect(assertDownloadedZip(target, URL_UNDER_TEST)).rejects.toMatchObject({
      code: 'ARCHIVE_UNREADABLE',
    });
  });
});
