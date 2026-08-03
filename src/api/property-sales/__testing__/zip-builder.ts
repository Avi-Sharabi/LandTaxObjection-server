/**
 * Builds small ZIP archives in memory for tests, including malformed ones
 * that a real zip library would refuse to create — a path-traversal name, a
 * symlink entry, or a fabricated zip-bomb ratio. Jest never sees these
 * fixtures on disk; they're constructed per-test and written to a temp dir.
 *
 * yauzl only needs entries backed by a real ZIP byte stream, so we still go
 * through Node's zlib deflate to produce well-formed local file headers —
 * only the *fields we want to attack* (name, external attributes) are
 * hand-set afterwards.
 *
 * Ported verbatim from nsw-property-sales-poc/tests/helpers/zip-builder.ts
 * (KAN-241) — no logic changes. Deliberately not named `*.spec.ts`, since
 * this repo's Jest config (`testRegex: .*\.spec\.ts$`) would otherwise try
 * to run it as a test file with no tests in it.
 */

import { deflateRawSync } from 'node:zlib';

export interface FixtureEntry {
  readonly name: string;
  readonly content?: string | Buffer;
  /** Defaults to a regular-file Unix mode (0o100644). */
  readonly unixMode?: number;
  /** Overrides the declared uncompressed size in the local/central headers. */
  readonly declaredUncompressedSize?: number;
  readonly isDirectory?: boolean;
}

function crc32(buf: Buffer): number {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (~crc) >>> 0;
}

function dosDateTime(): { time: number; date: number } {
  // Fixed, arbitrary DOS timestamp; tests never assert on it.
  return { time: 0, date: (2026 - 1980) << 9 | (1 << 5) | 1 };
}

/** Builds a minimal but structurally valid ZIP buffer from raw entries. */
export function buildZip(entries: readonly FixtureEntry[]): Buffer {
  const { time, date } = dosDateTime();
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const content = entry.content ?? '';
    const raw = entry.isDirectory
      ? Buffer.alloc(0)
      : Buffer.isBuffer(content)
        ? content
        : Buffer.from(content, 'utf8');
    const compressed = entry.isDirectory ? Buffer.alloc(0) : deflateRawSync(raw);
    const crc = entry.isDirectory ? 0 : crc32(raw);
    const uncompressedSize = entry.declaredUncompressedSize ?? raw.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(entry.isDirectory ? 0 : 8, 8); // method: 8 = deflate, 0 = store
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    localParts.push(localHeader, nameBuf, compressed);

    const mode = entry.unixMode ?? (entry.isDirectory ? 0o040755 : 0o100644);
    const externalAttrs = (mode << 16) >>> 0;

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE((3 << 8) | 20, 4); // version made by: Unix, spec 2.0
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(entry.isDirectory ? 0 : 8, 10); // method
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra field length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(externalAttrs, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const localSection = Buffer.concat(localParts);
  const centralSection = Buffer.concat(centralParts);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSection.length, 12);
  eocd.writeUInt32LE(localSection.length, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localSection, centralSection, eocd]);
}

/** A single small text entry, for tests that just need a well-formed archive. */
export function buildSimpleZip(name = 'file.txt', content = 'hello'): Buffer {
  return buildZip([{ name, content }]);
}
