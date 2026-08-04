import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  type ArchiveLimits,
  createArchiveGuard,
  extractDatFiles,
  resolveEntryTarget,
  sha256File,
  validateEntryMode,
  validateEntryName,
  type ZipEntryDescriptor,
} from './archive-extractor';
import { buildZip } from './__testing__/zip-builder';

const LIMITS: ArchiveLimits = {
  maxTotalUncompressedBytes: 8 * 1024 * 1024 * 1024,
  maxEntryUncompressedBytes: 1024 * 1024 * 1024,
  maxEntryCount: 20_000,
  maxCompressionRatio: 200,
};

function descriptor(
  overrides: Partial<ZipEntryDescriptor> = {},
): ZipEntryDescriptor {
  return {
    fileName: '001_SALES_DATA_NNME_27072026.DAT',
    uncompressedSize: 1000,
    compressedSize: 300,
    externalFileAttributes: (0o100644 << 16) >>> 0,
    versionMadeBy: (3 << 8) | 20, // Unix, spec version 2.0
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Entry guard
// ─────────────────────────────────────────────────────────────────────────

describe('validateEntryName', () => {
  it('accepts a plain relative file name', () => {
    const verdict = validateEntryName('001_SALES_DATA_NNME_27072026.DAT');
    expect(verdict).toEqual({
      ok: true,
      relativePath: '001_SALES_DATA_NNME_27072026.DAT',
      kind: 'file',
    });
  });

  it('accepts nested relative directories', () => {
    const verdict = validateEntryName('a/b/c.dat');
    expect(verdict).toEqual({
      ok: true,
      relativePath: 'a/b/c.dat',
      kind: 'file',
    });
  });

  it('accepts a directory entry (trailing slash)', () => {
    const verdict = validateEntryName('a/b/');
    expect(verdict).toEqual({
      ok: true,
      relativePath: 'a/b',
      kind: 'directory',
    });
  });

  it('rejects an empty name', () => {
    const verdict = validateEntryName('');
    expect(verdict).toMatchObject({ ok: false, code: 'ENTRY_EMPTY_NAME' });
  });

  it.each([['../evil.dat'], ['a/../../evil.dat'], ['a/../..']])(
    'rejects a ".." traversal segment: %s',
    (name) => {
      const verdict = validateEntryName(name);
      expect(verdict).toMatchObject({
        ok: false,
        code: 'ENTRY_PATH_TRAVERSAL',
      });
    },
  );

  it('rejects an absolute path', () => {
    const verdict = validateEntryName('/etc/passwd');
    expect(verdict).toMatchObject({ ok: false, code: 'ENTRY_ABSOLUTE_PATH' });
  });

  it('rejects a UNC-style path', () => {
    const verdict = validateEntryName('//server/share/file.dat');
    expect(verdict).toMatchObject({ ok: false, code: 'ENTRY_UNC_PATH' });
  });

  it('rejects a Windows drive letter', () => {
    const verdict = validateEntryName('C:/Windows/System32/evil.dll');
    expect(verdict).toMatchObject({ ok: false, code: 'ENTRY_DRIVE_LETTER' });
  });

  it('rejects a backslash-separated path', () => {
    const verdict = validateEntryName('..\\..\\evil.dat');
    expect(verdict).toMatchObject({
      ok: false,
      code: 'ENTRY_ILLEGAL_CHARACTER',
    });
  });

  it('rejects a NUL byte in the name', () => {
    const verdict = validateEntryName('evil.dat\u0000.txt');
    expect(verdict).toMatchObject({
      ok: false,
      code: 'ENTRY_ILLEGAL_CHARACTER',
    });
  });

  it('rejects a segment ending in a dot (Windows alias trick)', () => {
    const verdict = validateEntryName('evil.dat. ');
    expect(verdict).toMatchObject({
      ok: false,
      code: 'ENTRY_ILLEGAL_CHARACTER',
    });
  });

  it('rejects a reserved Windows device name', () => {
    const verdict = validateEntryName('CON.dat');
    expect(verdict).toMatchObject({ ok: false, code: 'ENTRY_RESERVED_NAME' });
  });

  it('rejects an NTFS alternate-data-stream colon', () => {
    const verdict = validateEntryName('file.dat:hidden');
    expect(verdict).toMatchObject({
      ok: false,
      code: 'ENTRY_ILLEGAL_CHARACTER',
    });
  });
});

describe('validateEntryMode', () => {
  it('allows a regular file with standard Unix permissions', () => {
    expect(validateEntryMode(descriptor(), 'file')).toBeNull();
  });

  it('rejects a symlink entry', () => {
    const entry = descriptor({
      externalFileAttributes: (0o120777 << 16) >>> 0,
    });
    expect(validateEntryMode(entry, 'file')).toMatchObject({
      ok: false,
      code: 'ENTRY_SYMLINK',
    });
  });

  it('rejects a device/fifo/socket entry', () => {
    // S_IFSOCK = 0o140000
    const entry = descriptor({
      externalFileAttributes: (0o140644 << 16) >>> 0,
    });
    expect(validateEntryMode(entry, 'file')).toMatchObject({
      ok: false,
      code: 'ENTRY_NOT_REGULAR_FILE',
    });
  });

  it('skips the mode check for archives not made on Unix', () => {
    const entry = descriptor({ versionMadeBy: (0 << 8) | 20 }); // 0 = MS-DOS/FAT
    expect(validateEntryMode(entry, 'file')).toBeNull();
  });
});

describe('createArchiveGuard', () => {
  it('accepts entries within all limits and tracks totals', () => {
    const guard = createArchiveGuard(LIMITS);
    const first = guard.check(
      descriptor({
        fileName: 'a.dat',
        uncompressedSize: 100,
        compressedSize: 20,
      }),
    );
    const second = guard.check(
      descriptor({
        fileName: 'b.dat',
        uncompressedSize: 200,
        compressedSize: 40,
      }),
    );

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(guard.totals()).toEqual({
      entryCount: 2,
      totalUncompressedBytes: 300,
      totalCompressedBytes: 60,
    });
  });

  it('rejects a duplicate entry name (case-insensitive)', () => {
    const guard = createArchiveGuard(LIMITS);
    guard.check(descriptor({ fileName: 'a.dat' }));
    const verdict = guard.check(descriptor({ fileName: 'A.DAT' }));
    expect(verdict).toMatchObject({ ok: false, code: 'ENTRY_DUPLICATE_NAME' });
  });

  it('rejects once the entry count limit is exceeded', () => {
    const guard = createArchiveGuard({ ...LIMITS, maxEntryCount: 1 });
    guard.check(descriptor({ fileName: 'a.dat' }));
    const verdict = guard.check(descriptor({ fileName: 'b.dat' }));
    expect(verdict).toMatchObject({
      ok: false,
      code: 'ARCHIVE_TOO_MANY_ENTRIES',
    });
  });

  it('rejects a single entry over the per-entry size limit', () => {
    const guard = createArchiveGuard({
      ...LIMITS,
      maxEntryUncompressedBytes: 500,
    });
    const verdict = guard.check(
      descriptor({ fileName: 'huge.dat', uncompressedSize: 501 }),
    );
    expect(verdict).toMatchObject({ ok: false, code: 'ENTRY_TOO_LARGE' });
  });

  it('rejects once the cumulative total exceeds the archive limit', () => {
    const guard = createArchiveGuard({
      ...LIMITS,
      maxTotalUncompressedBytes: 150,
    });
    guard.check(
      descriptor({
        fileName: 'a.dat',
        uncompressedSize: 100,
        compressedSize: 50,
      }),
    );
    const verdict = guard.check(
      descriptor({
        fileName: 'b.dat',
        uncompressedSize: 100,
        compressedSize: 50,
      }),
    );
    expect(verdict).toMatchObject({
      ok: false,
      code: 'ARCHIVE_TOTAL_TOO_LARGE',
    });
  });

  it('rejects a zip-bomb-shaped entry (huge ratio above the size floor)', () => {
    const guard = createArchiveGuard({ ...LIMITS, maxCompressionRatio: 200 });
    const verdict = guard.check(
      descriptor({
        fileName: 'bomb.dat',
        uncompressedSize: 2 * 1024 * 1024,
        compressedSize: 1024,
      }),
    );
    expect(verdict).toMatchObject({ ok: false, code: 'ENTRY_RATIO_EXCEEDED' });
  });

  it('does not apply the ratio check below the size floor', () => {
    const guard = createArchiveGuard({ ...LIMITS, maxCompressionRatio: 5 });
    const verdict = guard.check(
      descriptor({
        fileName: 'tiny.dat',
        uncompressedSize: 500,
        compressedSize: 10,
      }),
    );
    expect(verdict.ok).toBe(true);
  });
});

describe('resolveEntryTarget', () => {
  it('resolves a safe relative path under the destination', () => {
    const target = resolveEntryTarget('/safe/root', 'a/b.dat', {
      resolve: (...parts) => parts.join('/').replace(/\/+/g, '/'),
      sep: '/',
    });
    expect(target).toBe('/safe/root/a/b.dat');
  });

  it('throws if a path would escape the destination', () => {
    expect(() =>
      resolveEntryTarget('/safe/root', '../../etc/passwd', {
        resolve: (...parts) => {
          const joined = parts.join('/');
          const segments: string[] = [];
          for (const seg of joined.split('/')) {
            if (seg === '..') segments.pop();
            else if (seg !== '.' && seg !== '') segments.push(seg);
          }
          return `/${segments.join('/')}`;
        },
        sep: '/',
      }),
    ).toThrow(/escapes the destination/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// ZIP extraction
// ─────────────────────────────────────────────────────────────────────────

describe('extractDatFiles', () => {
  let workDir: string;
  let destDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'psi-zip-test-'));
    destDir = join(workDir, 'out');
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  async function writeFixtureZip(buffer: Buffer): Promise<string> {
    const path = join(workDir, 'fixture.zip');
    await writeFile(path, buffer);
    return path;
  }

  it('extracts every .dat entry and reports it', async () => {
    const zipPath = await writeFixtureZip(
      buildZip([
        { name: 'a.dat', content: 'A;RTSALEDATA;001;20260727 01:00;VALNET;' },
        { name: 'b.dat', content: 'Z;7;1;1;3;' },
      ]),
    );

    const result = await extractDatFiles(zipPath, destDir, LIMITS);

    expect(result.entryCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(result.files.map((f) => f.relativePath).sort()).toEqual([
      'a.dat',
      'b.dat',
    ]);

    const written = await readFile(join(destDir, 'a.dat'), 'utf8');
    expect(written).toBe('A;RTSALEDATA;001;20260727 01:00;VALNET;');
  });

  it("skips non-.dat entries (e.g. the archive's creative_commons.txt) without writing them", async () => {
    const zipPath = await writeFixtureZip(
      buildZip([
        { name: 'creative_commons.txt', content: 'licence text' },
        { name: '001.dat', content: 'Z;1;0;0;0;' },
      ]),
    );

    const result = await extractDatFiles(zipPath, destDir, LIMITS);

    expect(result.files.map((f) => f.relativePath)).toEqual(['001.dat']);
    expect(result.skippedCount).toBe(1);
    await expect(
      readFile(join(destDir, 'creative_commons.txt')),
    ).rejects.toThrow();
  });

  it('matches .dat case-insensitively (the real feed ships .DAT)', async () => {
    const zipPath = await writeFixtureZip(
      buildZip([{ name: '001_SALES_DATA_NNME_27072026.DAT', content: 'x' }]),
    );

    const result = await extractDatFiles(zipPath, destDir, LIMITS);
    expect(result.files).toHaveLength(1);
  });

  it('throws ARCHIVE_NO_DAT_FILES when the archive has no .dat entries', async () => {
    const zipPath = await writeFixtureZip(
      buildZip([{ name: 'creative_commons.txt', content: 'licence text' }]),
    );

    await expect(
      extractDatFiles(zipPath, destDir, LIMITS),
    ).rejects.toMatchObject({
      code: 'ARCHIVE_NO_DAT_FILES',
    });
  });

  it('rejects a path-traversal entry name before writing anything, even though it would have been skipped', async () => {
    const zipPath = await writeFixtureZip(
      buildZip([{ name: '../escaped.txt', content: 'evil' }]),
    );

    await expect(
      extractDatFiles(zipPath, destDir, LIMITS),
    ).rejects.toMatchObject({
      code: 'ENTRY_PATH_TRAVERSAL',
    });
  });

  it('rejects an absolute-path entry name', async () => {
    const zipPath = await writeFixtureZip(
      buildZip([{ name: '/etc/passwd', content: 'evil' }]),
    );

    await expect(
      extractDatFiles(zipPath, destDir, LIMITS),
    ).rejects.toMatchObject({
      code: 'ENTRY_ABSOLUTE_PATH',
    });
  });

  it('rejects a symlink entry (Unix mode bits)', async () => {
    const zipPath = await writeFixtureZip(
      buildZip([
        { name: 'link.dat', content: '/etc/passwd', unixMode: 0o120777 },
      ]),
    );

    await expect(
      extractDatFiles(zipPath, destDir, LIMITS),
    ).rejects.toMatchObject({ code: 'ENTRY_SYMLINK' });
  });

  it('rejects a duplicate entry name', async () => {
    const zipPath = await writeFixtureZip(
      buildZip([
        { name: 'a.dat', content: 'one' },
        { name: 'a.dat', content: 'two' },
      ]),
    );

    await expect(
      extractDatFiles(zipPath, destDir, LIMITS),
    ).rejects.toMatchObject({
      code: 'ENTRY_DUPLICATE_NAME',
    });
  });

  it('rejects an entry whose declared size does not match its actual content', async () => {
    const zipPath = await writeFixtureZip(
      buildZip([
        {
          name: 'lied.dat',
          content: 'short',
          declaredUncompressedSize: 999_999,
        },
      ]),
    );

    await expect(
      extractDatFiles(zipPath, destDir, LIMITS),
    ).rejects.toMatchObject({
      code: 'ENTRY_SIZE_MISMATCH',
    });
  });

  it('rejects an archive with more entries than the configured limit', async () => {
    const zipPath = await writeFixtureZip(
      buildZip([
        { name: 'a.dat', content: 'a' },
        { name: 'b.dat', content: 'b' },
      ]),
    );

    await expect(
      extractDatFiles(zipPath, destDir, { ...LIMITS, maxEntryCount: 1 }),
    ).rejects.toMatchObject({
      code: 'ARCHIVE_TOO_MANY_ENTRIES',
    });
  });

  it('creates directory entries without listing or counting them as files', async () => {
    const zipPath = await writeFixtureZip(
      buildZip([
        { name: 'nested/', isDirectory: true },
        { name: 'nested/file.dat', content: 'hello' },
      ]),
    );

    const result = await extractDatFiles(zipPath, destDir, LIMITS);
    expect(result.files.map((f) => f.relativePath)).toEqual([
      'nested/file.dat',
    ]);
  });
});

describe('sha256File', () => {
  it('computes a stable digest for known content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'psi-sha256-'));
    try {
      const path = join(dir, 'hash-me.txt');
      await writeFile(path, 'hello world');
      const digest = await sha256File(path);
      // sha256("hello world")
      expect(digest).toBe(
        'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
