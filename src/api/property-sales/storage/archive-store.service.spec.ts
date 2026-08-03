import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';

import { ArchiveStoreService, ARCHIVE_FILENAME_PATTERN, STAGING_ID_PATTERN } from './archive-store.service';
import { PropertySalesConfig } from '../property-sales.config';

function fakeConfig(archiveRoot: string): PropertySalesConfig {
  const values: Record<string, string> = { PSI_DOWNLOAD_ENABLED: 'true', PSI_ARCHIVE_ROOT: archiveRoot };
  const configService = { get: (key: string) => values[key] } as unknown as ConfigService;
  return new PropertySalesConfig(configService);
}

let archiveRoot: string;
let service: ArchiveStoreService;

beforeEach(async () => {
  archiveRoot = await mkdtemp(join(tmpdir(), 'psi-archive-store-'));
  service = new ArchiveStoreService(fakeConfig(archiveRoot));
});

afterEach(async () => {
  await rm(archiveRoot, { recursive: true, force: true });
});

describe('createStagingWorkspace', () => {
  it('creates <archiveRoot>/staging/<runId>/', async () => {
    const workspace = await service.createStagingWorkspace();
    expect(workspace.stagingDir).toBe(join(archiveRoot, 'staging', workspace.runId));
    expect(workspace.runId).toMatch(STAGING_ID_PATTERN);
    const st = await stat(workspace.stagingDir);
    expect(st.isDirectory()).toBe(true);
  });
});

describe('assertSafeToDelete', () => {
  it('accepts a well-formed staging directory directly under the staging root', async () => {
    const workspace = await service.createStagingWorkspace();
    const boundary = join(archiveRoot, 'staging');
    const resolved = await service.assertSafeToDelete(workspace.stagingDir, boundary, STAGING_ID_PATTERN);
    expect(resolved).toBeTruthy();
  });

  it('rejects a relative path', async () => {
    const boundary = join(archiveRoot, 'staging');
    await expect(
      service.assertSafeToDelete('staging/some-run', boundary, STAGING_ID_PATTERN),
    ).rejects.toMatchObject({ code: 'WORKSPACE_UNSAFE_DELETE' });
  });

  it("rejects a path whose basename doesn't match the expected pattern", async () => {
    const boundary = join(archiveRoot, 'staging');
    await mkdir(boundary, { recursive: true });
    const badDir = join(boundary, 'not-a-uuid');
    await mkdir(badDir, { recursive: true });
    await expect(service.assertSafeToDelete(badDir, boundary, STAGING_ID_PATTERN)).rejects.toMatchObject({
      code: 'WORKSPACE_UNSAFE_DELETE',
    });
  });

  it('rejects a path outside the configured boundary root', async () => {
    const workspace = await service.createStagingWorkspace();
    const wrongBoundary = join(archiveRoot, 'quarantine');
    await mkdir(wrongBoundary, { recursive: true });
    await expect(
      service.assertSafeToDelete(workspace.stagingDir, wrongBoundary, STAGING_ID_PATTERN),
    ).rejects.toMatchObject({ code: 'WORKSPACE_UNSAFE_DELETE' });
  });

  it('rejects a target nested one level too deep', async () => {
    const boundary = join(archiveRoot, 'staging');
    await mkdir(boundary, { recursive: true });
    const outerRunId = '11111111-1111-1111-1111-111111111111';
    const innerRunId = '22222222-2222-2222-2222-222222222222';
    const trap = join(boundary, outerRunId, innerRunId);
    await mkdir(trap, { recursive: true });
    await expect(service.assertSafeToDelete(trap, boundary, STAGING_ID_PATTERN)).rejects.toMatchObject({
      code: 'WORKSPACE_UNSAFE_DELETE',
    });
  });

  // Creating a directory symlink on Windows requires elevated privileges or
  // Developer Mode; skip there rather than fail on an environment limitation
  // unrelated to the guard logic under test. This is the regression test for
  // the stat -> lstat fix: a naive `stat()` port would let this through,
  // since `stat` follows the symlink to a real, otherwise-valid directory.
  (process.platform === 'win32' ? it.skip : it)(
    'rejects a symlinked staging directory',
    async () => {
      const boundary = join(archiveRoot, 'staging');
      await mkdir(boundary, { recursive: true });
      const real = join(archiveRoot, 'real-target');
      await mkdir(real, { recursive: true });
      const runId = '33333333-3333-3333-3333-333333333333';
      const linkPath = join(boundary, runId);
      await symlink(real, linkPath, 'dir');
      await expect(service.assertSafeToDelete(linkPath, boundary, STAGING_ID_PATTERN)).rejects.toMatchObject({
        code: 'WORKSPACE_UNSAFE_DELETE',
      });
    },
  );

  it('rejects an unresolvable path rather than deleting it', async () => {
    const boundary = join(archiveRoot, 'staging');
    await mkdir(boundary, { recursive: true });
    const missing = join(boundary, '44444444-4444-4444-4444-444444444444');
    // Never created — realpath must fail.
    await expect(service.assertSafeToDelete(missing, boundary, STAGING_ID_PATTERN)).rejects.toMatchObject({
      code: 'WORKSPACE_UNRESOLVABLE',
    });
  });
});

describe('deleteStagingWorkspace', () => {
  it('deletes a legitimate staging workspace and its contents', async () => {
    const workspace = await service.createStagingWorkspace();
    await writeFile(join(workspace.stagingDir, 'evidence.txt'), 'hello');

    await service.deleteStagingWorkspace(workspace.stagingDir);

    await expect(stat(workspace.stagingDir)).rejects.toThrow();
  });

  it('refuses to delete a directory outside the staging root', async () => {
    const outside = join(archiveRoot, 'do-not-delete-me');
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'important.txt'), 'keep me');

    await expect(service.deleteStagingWorkspace(outside)).rejects.toMatchObject({
      code: 'WORKSPACE_UNSAFE_DELETE',
    });

    // The directory must still exist — the guard must fire before any rm call.
    const st = await stat(outside);
    expect(st.isDirectory()).toBe(true);
  });
});

describe('quarantineArchive', () => {
  it('moves the file to <archiveRoot>/quarantine/<sha256>-<runId>.zip', async () => {
    const workspace = await service.createStagingWorkspace();
    const archivePath = join(workspace.stagingDir, 'archive.zip');
    await writeFile(archivePath, 'not really a zip');

    const sha256 = 'a'.repeat(64);
    const destination = await service.quarantineArchive(archivePath, sha256, workspace.runId);

    expect(destination).toBe(join(archiveRoot, 'quarantine', `${sha256}-${workspace.runId}.zip`));
    const st = await stat(destination);
    expect(st.isFile()).toBe(true);
    await expect(stat(archivePath)).rejects.toThrow();
  });
});

describe('deleteArchiveFile', () => {
  it('deletes a well-formed archive file directly under archivesDir', async () => {
    await mkdir(join(archiveRoot, 'archives'), { recursive: true });
    const archivePath = join(archiveRoot, 'archives', '2026-08-03-20260803.zip');
    await writeFile(archivePath, 'zip bytes');
    expect('2026-08-03-20260803.zip').toMatch(ARCHIVE_FILENAME_PATTERN);

    await service.deleteArchiveFile(archivePath);

    await expect(stat(archivePath)).rejects.toThrow();
  });

  it('refuses to delete a file outside archivesDir', async () => {
    const outside = join(archiveRoot, '2026-08-03-20260803.zip');
    await writeFile(outside, 'zip bytes');

    await expect(service.deleteArchiveFile(outside)).rejects.toMatchObject({
      code: 'WORKSPACE_UNSAFE_DELETE',
    });
    const st = await stat(outside);
    expect(st.isFile()).toBe(true);
  });
});
