import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validateCronExpression } from 'cron';

import { InvalidConfigurationException } from '../../common/exceptions/invalid-configuration.exception';
import type { ArchiveLimits } from './archive-extractor';

/**
 * Validated, frozen configuration for the property-sales ingestion pipeline
 * (KAN-241 rebuild): discover → download → unzip → parse. Replaces
 * nsw-property-sales-poc/src/config/env.ts wholesale, same reasons as
 * before (import.meta.url is a compile error under this repo's CommonJS
 * output; the POC's non-production DB guard must never gate this app's
 * boot against the real dev/qa/prod database).
 *
 * This is a deliberately smaller surface than the first KAN-241 pass: no
 * ledger table, no BullMQ queue, no retention sweep, so there is no
 * PSI_ARCHIVE_ROOT (archives live in an OS temp dir for the lifetime of one
 * sweep and are removed when it finishes) and no PSI_RETENTION_* family.
 *
 * Two jobs, same as before:
 *  1. Fail loudly and early (via the existing InvalidConfigurationException)
 *     on malformed configuration.
 *  2. Do so ONLY when the feature is enabled (`PSI_DOWNLOAD_ENABLED=true`) —
 *     an unconfigured deployment (the default, everywhere) must still boot
 *     cleanly. This is the master switch: merging this branch is a no-op.
 */

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

  // Number() would accept '1e3', '0x10' and ' 12 '; require plain digits.
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

function readCronExpression(
  config: ConfigService,
  key: string,
  fallback: string,
): string {
  const raw = config.get<string>(key)?.trim();
  const expression = raw === undefined || raw === '' ? fallback : raw;
  const result = validateCronExpression(expression);
  if (!result.valid) {
    invalid(
      `${key} is not a valid cron expression: "${expression}" (${result.error?.message ?? 'unknown error'})`,
    );
  }
  return expression;
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

/** Comma-separated list -> a trimmed, non-empty, uppercased set. Empty input -> empty set (no exclusions). */
function parseCodeSet(raw: string): ReadonlySet<string> {
  const codes = raw
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter((code) => code !== '');
  return Object.freeze(new Set(codes));
}

@Injectable()
export class PropertySalesConfig {
  /** Master switch. Defaults to false everywhere until explicitly opted into. */
  readonly enabled: boolean;

  readonly cronSchedule: string;

  readonly discoveryUrl: string;
  readonly weeklyLinkPattern: RegExp;
  readonly allowedDownloadHosts: readonly string[];

  /** Container has no display; flip only together with xvfb. */
  readonly headless: boolean;
  readonly browserTimeoutMs: number;
  readonly downloadTimeoutMs: number;
  readonly maxArchiveBytes: number;
  /** Bounds a single sweep's catch-up so runtime stays predictable. */
  readonly maxArchivesPerRun: number;

  /**
   * Content-level sale exclusions, applied after the mandatory record-type
   * filtering (keep B records, drop A/C/Z, drop the leading 'B' marker).
   * Both default to empty — a no-op — until the actual business rule for
   * "exclude sales of type/zoning B" is confirmed; flipping either on is
   * then an env-var change, not a code change. See dat-parser.ts.
   */
  readonly excludedSaleCodes: ReadonlySet<string>;
  readonly excludedZonings: ReadonlySet<string>;

  /**
   * ZIP-bomb / path-traversal ceilings for archive-extractor.ts. A real
   * weekly archive is ~200-300KB with ~123 small .dat files, so these are
   * safety ceilings, not expected values — the defaults match
   * nsw-property-sales-poc/src/config/env.ts.
   */
  readonly archiveLimits: ArchiveLimits;

  constructor(config: ConfigService) {
    this.enabled = readBool(config, 'PSI_DOWNLOAD_ENABLED', false);

    this.cronSchedule = readCronExpression(
      config,
      'PSI_CRON_SCHEDULE',
      '0 3 * * 1',
    );

    // The Valuer General's public bulk PSI listing: a plain HTML page of
    // absolute .zip links, no portal JavaScript, no login. Verified directly
    // to be reachable headless, with stealth.
    this.discoveryUrl = readString(
      config,
      'PSI_DISCOVERY_URL',
      'https://www.valuergeneral.nsw.gov.au/design/bulk_psi_content/bulk_psi',
    );

    // Anchored on the URL *path*, and narrow on purpose: the live listing
    // also serves ~36 yearly archives under /__psi/yearly/YYYY.zip, and a
    // bare `\.zip$` would match both.
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
