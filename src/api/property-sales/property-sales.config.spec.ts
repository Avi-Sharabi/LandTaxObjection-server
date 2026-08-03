import type { ConfigService } from '@nestjs/config';

import { PropertySalesConfig } from './property-sales.config';

/** Minimal ConfigService stand-in: only `.get(key)` is ever called. */
function fakeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const ENABLED_BASE = {
  PSI_DOWNLOAD_ENABLED: 'true',
  PSI_ARCHIVE_ROOT: '/data/psi-archives',
};

describe('PropertySalesConfig', () => {
  it('disabled + unset PSI_ARCHIVE_ROOT does not throw (boot-safety property)', () => {
    expect(() => new PropertySalesConfig(fakeConfig({}))).not.toThrow();
  });

  it('defaults enabled to false', () => {
    const config = new PropertySalesConfig(fakeConfig({}));
    expect(config.enabled).toBe(false);
  });

  it('requires PSI_ARCHIVE_ROOT when enabled', () => {
    expect(() => new PropertySalesConfig(fakeConfig({ PSI_DOWNLOAD_ENABLED: 'true' }))).toThrow(
      /PSI_ARCHIVE_ROOT is required/,
    );
  });

  it('rejects a relative PSI_ARCHIVE_ROOT', () => {
    expect(() =>
      new PropertySalesConfig(fakeConfig({ ...ENABLED_BASE, PSI_ARCHIVE_ROOT: 'relative/path' })),
    ).toThrow(/absolute path/);
  });

  it('rejects a filesystem root as PSI_ARCHIVE_ROOT', () => {
    expect(() =>
      new PropertySalesConfig(fakeConfig({ ...ENABLED_BASE, PSI_ARCHIVE_ROOT: process.platform === 'win32' ? 'C:\\' : '/' })),
    ).toThrow(/filesystem root/);
  });

  it('accepts a well-formed absolute PSI_ARCHIVE_ROOT and derives archivesDir/stagingDir/quarantineDir', () => {
    const config = new PropertySalesConfig(fakeConfig(ENABLED_BASE));
    expect(config.archivesDir.startsWith(config.stagingDir.slice(0, config.stagingDir.lastIndexOf('staging')))).toBe(true);
    expect(config.archivesDir.endsWith('archives')).toBe(true);
    expect(config.stagingDir.endsWith('staging')).toBe(true);
    expect(config.quarantineDir.endsWith('quarantine')).toBe(true);
  });

  it('rejects an out-of-bounds numeric value', () => {
    expect(() =>
      new PropertySalesConfig(fakeConfig({ ...ENABLED_BASE, PSI_MAX_ARCHIVES_PER_RUN: '5000' })),
    ).toThrow(/between 1 and 500/);
  });

  it('rejects a non-integer numeric value', () => {
    expect(() =>
      new PropertySalesConfig(fakeConfig({ ...ENABLED_BASE, PSI_MAX_ARCHIVES_PER_RUN: 'abc' })),
    ).toThrow(/non-negative integer/);
  });

  it('rejects an invalid PSI_WEEKLY_LINK_PATTERN', () => {
    expect(() =>
      new PropertySalesConfig(fakeConfig({ ...ENABLED_BASE, PSI_WEEKLY_LINK_PATTERN: '(unclosed' })),
    ).toThrow(/not a valid regular expression/);
  });

  it('rejects an invalid cron expression', () => {
    expect(() =>
      new PropertySalesConfig(fakeConfig({ ...ENABLED_BASE, PSI_DOWNLOAD_CRON_SCHEDULE: 'not a cron' })),
    ).toThrow(/not a valid cron expression/);
  });

  it('rejects a non-boolean flag rather than silently defaulting', () => {
    expect(() =>
      new PropertySalesConfig(fakeConfig({ ...ENABLED_BASE, PSI_RETENTION_DRY_RUN: 'maybe' })),
    ).toThrow(/must be a boolean/);
  });

  it('parses PSI_ALLOWED_DOWNLOAD_HOSTS into a lowercase array', () => {
    const config = new PropertySalesConfig(
      fakeConfig({ ...ENABLED_BASE, PSI_ALLOWED_DOWNLOAD_HOSTS: 'Example.NSW.gov.au, other.example.com' }),
    );
    expect(config.allowedDownloadHosts).toEqual(['example.nsw.gov.au', 'other.example.com']);
  });

  it('defaults retentionAllowUnloaded to false — the KAN-242 safety guarantee', () => {
    const config = new PropertySalesConfig(fakeConfig(ENABLED_BASE));
    expect(config.retentionAllowUnloaded).toBe(false);
  });

  it('defaults retentionDryRun to true', () => {
    const config = new PropertySalesConfig(fakeConfig(ENABLED_BASE));
    expect(config.retentionDryRun).toBe(true);
  });
});
