/**
 * Proves a downloaded file is a real archive before the ledger is allowed to
 * mark it `downloaded`.
 *
 * Why this is a separate gate rather than something later discovers: a
 * bot-protection challenge can be served *as an attachment*, in which case
 * the browser reports a perfectly successful download of an HTML document.
 * Without a check here that body would be renamed into the archive root,
 * hashed, and written into the ledger as though a challenge page were
 * genuine source data. Validating at the download boundary makes that path
 * unreachable instead of merely untidy.
 *
 * Four gates, in increasing cost order so the cheap ones fail fast:
 *   1. the file is non-empty
 *   2. it starts with the local-file-header signature `PK\x03\x04`
 *   3. its central directory is readable (catches a truncated transfer that
 *      still carries a valid signature)
 *   4. its SHA-256 is computed, for the ledger row
 *
 * Gate 2 deliberately distinguishes *why* it failed: an HTML body means we
 * were served a page instead of the file, which is `DOWNLOAD_BLOCKED` — the
 * same code the `cf-mitigated: challenge` path reports — while any other
 * signature is an ordinary `DOWNLOAD_FAILED`. Conflating the two would hide
 * a challenge behind a generic error.
 *
 * Ported from nsw-property-sales-poc/src/download/zip-validator.ts
 * (KAN-241). Adaptation: the DOWNLOAD_BLOCKED message no longer points at
 * `PSI_STEALTH`/`run --archive <path>` (neither exists in this ticket's
 * scope) — it points at `PSI_HEADLESS` and the manual-upload fallback
 * instead (see README § Known limitations).
 */

import { open } from 'node:fs/promises';

import { assertArchiveReadable, sha256File } from '../archive/zip-inspector.util';
import { PropertySalesIngestionException } from '../exceptions/property-sales-ingestion.exception';

export interface ValidatedDownload {
  readonly bytes: number;
  readonly sha256: string;
  readonly entryCount: number;
}

/** Local file header. An empty archive (`PK\x05\x06`) has no DAT files, so it is not accepted. */
const ZIP_LOCAL_FILE_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/**
 * Recognises a body that is really an HTML document. Deliberately generous:
 * challenge interstitials vary in whether they lead with a doctype, a
 * comment, or the `<html>` tag itself, and a BOM may precede any of them.
 */
function looksLikeHtml(head: Buffer): boolean {
  const withoutBom = head.subarray(0, UTF8_BOM.length).equals(UTF8_BOM)
    ? head.subarray(UTF8_BOM.length)
    : head;
  const text = withoutBom.toString('latin1').trimStart().toLowerCase();
  return text.startsWith('<!doctype') || text.startsWith('<html') || text.startsWith('<!--');
}

/** Reads the leading bytes of a file, plus its size, in one open handle. */
async function readHead(path: string, length: number): Promise<{ head: Buffer; size: number }> {
  const handle = await open(path, 'r');
  try {
    const { size } = await handle.stat();
    const buffer = Buffer.alloc(Math.min(length, Math.max(size, 0)));
    if (buffer.length > 0) {
      await handle.read(buffer, 0, buffer.length, 0);
    }
    return { head: buffer, size };
  } finally {
    await handle.close();
  }
}

/**
 * Validates the file at `path` as a downloaded archive. Resolves with its
 * size, digest and entry count; throws a typed `PropertySalesIngestionException`
 * otherwise. Never moves or deletes the file — the caller owns its
 * lifecycle.
 */
export async function assertDownloadedZip(path: string, url: string): Promise<ValidatedDownload> {
  // 64 bytes is far more than the signature needs, and enough for the leading
  // whitespace/BOM/comment that an HTML body may carry before its first tag.
  const { head, size } = await readHead(path, 64);

  if (size === 0) {
    throw new PropertySalesIngestionException('DOWNLOAD_FAILED', `Download of ${url} produced an empty file`, {
      context: { url, bytes: 0 },
    });
  }

  if (!head.subarray(0, ZIP_LOCAL_FILE_HEADER.length).equals(ZIP_LOCAL_FILE_HEADER)) {
    const signature = head.subarray(0, ZIP_LOCAL_FILE_HEADER.length).toString('hex');

    if (looksLikeHtml(head)) {
      throw new PropertySalesIngestionException(
        'DOWNLOAD_BLOCKED',
        `${url} returned an HTML document in place of the archive (${size} bytes, signature ${signature}). ` +
          'This is a bot-protection challenge served as an attachment rather than the file itself. ' +
          'The download was discarded and nothing was recorded as downloaded — confirm PSI_HEADLESS/stealth ' +
          'configuration (see README § Known limitations), or use the manual archive-upload fallback.',
        { context: { url, bytes: size, signature } },
      );
    }

    throw new PropertySalesIngestionException(
      'DOWNLOAD_FAILED',
      `${url} did not return a ZIP archive: expected signature 504b0304, got ${signature} (${size} bytes)`,
      { context: { url, bytes: size, signature } },
    );
  }

  // A valid signature is not proof of a complete transfer; walking the central
  // directory is. Surfaces as ARCHIVE_UNREADABLE, which is accurate here.
  const entryCount = await assertArchiveReadable(path);

  const sha256 = await sha256File(path);

  return { bytes: size, sha256, entryCount };
}
