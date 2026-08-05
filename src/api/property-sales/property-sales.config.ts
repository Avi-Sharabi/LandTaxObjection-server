import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { InvalidConfigurationException } from '../../common/exceptions/invalid-configuration.exception';
import type { ArchiveLimits } from './archive-extractor';

const GIB = 1024 ** 3;

function invalid(detail: string): never {
  throw new InvalidConfigurationException(detail);
}

function readString(
  config: ConfigService,
  key: string,
  fallback?: string,
): string {
  const raw = config.get<string>(key)?.trim();
  if (raw === undefined || raw === '') {
    if (fallback !== undefined) return fallback;
    invalid(`Missing required environment variable ${key}`);
  }
  return raw;
}

function readInt(
  config: ConfigService,
  key: string,
  fallback: number,
  bounds: { min: number; max: number },
): number {
  const raw = config.get<string>(key)?.trim();
  if (raw === undefined || raw === '') return fallback;

  if (!/^\d+$/.test(raw)) {
    invalid(`${key} must be a non-negative integer, got "${raw}"`);
  }
  const value = Number(raw);
  if (value < bounds.min || value > bounds.max) {
    invalid(
      `${key} must be between ${bounds.min} and ${bounds.max}, got ${value}`,
    );
  }
  return value;
}

function readBool(
  config: ConfigService,
  key: string,
  fallback: boolean,
): boolean {
  const raw = config.get<string>(key)?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  invalid(`${key} must be a boolean (true/false), got "${raw}"`);
}

function compileWeeklyLinkPattern(raw: string): RegExp {
  try {
    return new RegExp(raw, 'i');
  } catch {
    invalid(
      `PSI_WEEKLY_LINK_PATTERN is not a valid regular expression: ${raw}`,
    );
  }
}

function parseAllowedHosts(raw: string): readonly string[] {
  const hosts = raw
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host !== '');
  if (hosts.length === 0) {
    invalid('PSI_ALLOWED_DOWNLOAD_HOSTS must list at least one host');
  }
  return Object.freeze(hosts);
}

function parseCodeSet(raw: string): ReadonlySet<string> {
  const codes = raw
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter((code) => code !== '');
  return Object.freeze(new Set(codes));
}

@Injectable()
export class PropertySalesConfig {
  readonly enabled: boolean;

  readonly discoveryUrl: string;

  readonly weeklyLinkSelector: string;
  readonly weeklyLinkPattern: RegExp;
  readonly allowedDownloadHosts: readonly string[];

  readonly headless: boolean;
  readonly browserTimeoutMs: number;
  readonly downloadTimeoutMs: number;
  readonly maxArchiveBytes: number;

  readonly maxArchivesPerRun: number;

  readonly logSampleRows: number;

  readonly excludedSaleCodes: ReadonlySet<string>;
  readonly excludedZonings: ReadonlySet<string>;

  readonly archiveLimits: ArchiveLimits;

  constructor(config: ConfigService) {
    this.enabled = readBool(config, 'PSI_DOWNLOAD_ENABLED', false);

    this.discoveryUrl = readString(
      config,
      'PSI_DISCOVERY_URL',
      'https://www.valuergeneral.nsw.gov.au/design/bulk_psi_content/bulk_psi',
    );

    this.weeklyLinkSelector = readString(
      config,
      'PSI_WEEKLY_LINK_SELECTOR',
      'div.panel-body.weekly a',
    );

    this.weeklyLinkPattern = compileWeeklyLinkPattern(
      readString(
        config,
        'PSI_WEEKLY_LINK_PATTERN',
        String.raw`^/__psi/weekly/\d{8}\.zip$`,
      ),
    );

    this.allowedDownloadHosts = parseAllowedHosts(
      readString(
        config,
        'PSI_ALLOWED_DOWNLOAD_HOSTS',
        'valuation.property.nsw.gov.au,www.valuergeneral.nsw.gov.au,valuergeneral.nsw.gov.au',
      ),
    );

    this.headless = readBool(config, 'PSI_HEADLESS', true);
    this.browserTimeoutMs = readInt(config, 'PSI_BROWSER_TIMEOUT_MS', 60_000, {
      min: 1_000,
      max: 600_000,
    });
    this.downloadTimeoutMs = readInt(
      config,
      'PSI_DOWNLOAD_TIMEOUT_MS',
      300_000,
      { min: 1_000, max: 1_800_000 },
    );
    this.maxArchiveBytes = readInt(config, 'PSI_MAX_ARCHIVE_BYTES', GIB, {
      min: 1,
      max: 64 * GIB,
    });
    this.maxArchivesPerRun = readInt(config, 'PSI_MAX_ARCHIVES_PER_RUN', 5, {
      min: 1,
      max: 500,
    });

    // Bounded on purpose: an archive holds ~3,250 sale rows, so logging them
    // all would bury every other line. 0 disables the sample entirely.
    this.logSampleRows = readInt(config, 'PSI_LOG_SAMPLE_ROWS', 3, {
      min: 0,
      max: 100,
    });

    this.excludedSaleCodes = parseCodeSet(
      readString(config, 'PSI_EXCLUDE_SALE_CODES', ''),
    );
    this.excludedZonings = parseCodeSet(
      readString(config, 'PSI_EXCLUDE_ZONINGS', ''),
    );

    this.archiveLimits = Object.freeze({
      maxTotalUncompressedBytes: readInt(
        config,
        'PSI_MAX_TOTAL_UNCOMPRESSED_BYTES',
        8 * GIB,
        {
          min: 1,
          max: 64 * GIB,
        },
      ),
      maxEntryUncompressedBytes: readInt(
        config,
        'PSI_MAX_ENTRY_UNCOMPRESSED_BYTES',
        GIB,
        {
          min: 1,
          max: 64 * GIB,
        },
      ),
      maxEntryCount: readInt(config, 'PSI_MAX_ENTRY_COUNT', 20_000, {
        min: 1,
        max: 1_000_000,
      }),
      maxCompressionRatio: readInt(config, 'PSI_MAX_COMPRESSION_RATIO', 200, {
        min: 2,
        max: 100_000,
      }),
    });
  }
}
