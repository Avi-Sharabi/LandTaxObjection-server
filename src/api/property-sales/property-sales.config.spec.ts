import type { ConfigService } from '@nestjs/config';

import { PropertySalesConfig } from './property-sales.config';

/** Minimal ConfigService stand-in: only `.get(key)` is ever called. */
function fakeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('PropertySalesConfig', () => {
  it('disabled + no other vars set does not throw (boot-safety property)', () => {
    expect(() => new PropertySalesConfig(fakeConfig({}))).not.toThrow();
  });

  it('defaults enabled to false', () => {
    const config = new PropertySalesConfig(fakeConfig({}));
    expect(config.enabled).toBe(false);
  });

  it('defaults excludedSaleCodes/excludedZonings to empty sets (the filter is a no-op until confirmed)', () => {
    const config = new PropertySalesConfig(fakeConfig({}));
    expect(config.excludedSaleCodes.size).toBe(0);
    expect(config.excludedZonings.size).toBe(0);
  });

  it('parses PSI_EXCLUDE_SALE_CODES / PSI_EXCLUDE_ZONINGS into trimmed, uppercased sets', () => {
    const config = new PropertySalesConfig(
      fakeConfig({
        PSI_EXCLUDE_SALE_CODES: ' ac, b ',
        PSI_EXCLUDE_ZONINGS: 'r2,B',
      }),
    );
    expect(config.excludedSaleCodes).toEqual(new Set(['AC', 'B']));
    expect(config.excludedZonings).toEqual(new Set(['R2', 'B']));
  });

  it('rejects an out-of-bounds numeric value', () => {
    expect(
      () =>
        new PropertySalesConfig(
          fakeConfig({
            PSI_DOWNLOAD_ENABLED: 'true',
            PSI_MAX_ARCHIVES_PER_RUN: '5000',
          }),
        ),
    ).toThrow(/between 1 and 500/);
  });

  it('rejects a non-integer numeric value', () => {
    expect(
      () =>
        new PropertySalesConfig(
          fakeConfig({
            PSI_DOWNLOAD_ENABLED: 'true',
            PSI_MAX_ARCHIVES_PER_RUN: 'abc',
          }),
        ),
    ).toThrow(/non-negative integer/);
  });

  it('rejects an invalid PSI_WEEKLY_LINK_PATTERN', () => {
    expect(
      () =>
        new PropertySalesConfig(
          fakeConfig({ PSI_WEEKLY_LINK_PATTERN: '(unclosed' }),
        ),
    ).toThrow(/not a valid regular expression/);
  });

  it('rejects an invalid cron expression', () => {
    expect(
      () =>
        new PropertySalesConfig(
          fakeConfig({ PSI_CRON_SCHEDULE: 'not a cron' }),
        ),
    ).toThrow(/not a valid cron expression/);
  });

  it('rejects a non-boolean flag rather than silently defaulting', () => {
    expect(
      () => new PropertySalesConfig(fakeConfig({ PSI_HEADLESS: 'maybe' })),
    ).toThrow(/must be a boolean/);
  });

  it('parses PSI_ALLOWED_DOWNLOAD_HOSTS into a lowercase array', () => {
    const config = new PropertySalesConfig(
      fakeConfig({
        PSI_ALLOWED_DOWNLOAD_HOSTS: 'Example.NSW.gov.au, other.example.com',
      }),
    );
    expect(config.allowedDownloadHosts).toEqual([
      'example.nsw.gov.au',
      'other.example.com',
    ]);
  });

  it('defaults headless to true (the deployed container has no display)', () => {
    const config = new PropertySalesConfig(fakeConfig({}));
    expect(config.headless).toBe(true);
  });

  it('defaults the archive-safety limits to sane ceilings', () => {
    const config = new PropertySalesConfig(fakeConfig({}));
    expect(config.archiveLimits.maxEntryCount).toBe(20_000);
    expect(config.archiveLimits.maxCompressionRatio).toBe(200);
  });

  it('rejects an out-of-bounds archive limit', () => {
    expect(
      () =>
        new PropertySalesConfig(fakeConfig({ PSI_MAX_COMPRESSION_RATIO: '1' })),
    ).toThrow(/between 2 and 100000/);
  });
});
