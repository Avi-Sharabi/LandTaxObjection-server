import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAbsolute, join, parse as parsePath, resolve as resolvePath } from 'node:path';
import { validateCronExpression } from 'cron';

import { InvalidConfigurationException } from '../../common/exceptions/invalid-configuration.exception';

/**
 * Validated, frozen configuration for the property-sales download pipeline
 * (KAN-241). Replaces nsw-property-sales-poc/src/config/env.ts wholesale —
 * that file cannot be ported as-is:
 *
 *  - it uses `import.meta.url`, a compile error under this repo's
 *    `module: nodenext` → CommonJS output;
 *  - `assertNonProductionDatabase`/`PSI_ALLOW_NONLOCAL_DB` refuse any
 *    database not named `nsw_psi_(poc|test)` on a loopback host — porting
 *    that would hard-fail this app's boot against the real dev/qa/prod
 *    database, which this ticket must never touch or gate.
 *
 * Two jobs, same as the POC's env.ts:
 *  1. Fail loudly and early (via the existing InvalidConfigurationException)
 *     on malformed configuration.
 *  2. Do so ONLY when the feature is enabled (`PSI_DOWNLOAD_ENABLED=true`) —
 *     an unconfigured deployment (the default, everywhere, until someone
 *     opts in) must still boot cleanly. This is the master switch: merging
 *     this branch must be a no-op.
 */

const GIB = 1024 ** 3;

function invalid(detail: string): never {
  throw new InvalidConfigurationException(detail);
}

function readString(config: ConfigService, key: string, fallback?: string): string {
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
    invalid(`${key} must be between ${bounds.min} and ${bounds.max}, got ${value}`);
  }
  return value;
}

function readBool(config: ConfigService, key: string, fallback: boolean): boolean {
  const raw = config.get<string>(key)?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  invalid(`${key} must be a boolean (true/false), got "${raw}"`);
}

function readCronExpression(config: ConfigService, key: string, fallback: string): string {
  const raw = config.get<string>(key)?.trim();
  const expression = raw === undefined || raw === '' ? fallback : raw;
  const result = validateCronExpression(expression);
  if (!result.valid) {
    invalid(`${key} is not a valid cron expression: "${expression}" (${result.error?.message ?? 'unknown error'})`);
  }
  return expression;
}

function compileWeeklyLinkPattern(raw: string): RegExp {
  try {
    return new RegExp(raw, 'i');
  } catch {
    invalid(`PSI_WEEKLY_LINK_PATTERN is not a valid regular expression: ${raw}`);
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

function isFilesystemRoot(path: string): boolean {
  return parsePath(path).root === path;
}

/**
 * Validates PSI_ARCHIVE_ROOT's syntax only (absolute, not a filesystem
 * root). This does NOT touch the filesystem — no `realpath`, no `mkdir`.
 * `ArchiveStoreService` resolves the real path lazily on first use and
 * treats that resolved path as the deletion boundary; anchoring to
 * `process.cwd()` here would be wrong, since it differs between
 * `nest start --watch` and `node dist/main.js`.
 */
function validateArchiveRootSyntax(raw: string): string {
  if (!isAbsolute(raw)) {
    invalid(`PSI_ARCHIVE_ROOT must be an absolute path, got "${raw}"`);
  }
  const resolved = resolvePath(raw);
  if (isFilesystemRoot(resolved)) {
    invalid(`PSI_ARCHIVE_ROOT must not be a filesystem root, got "${resolved}"`);
  }
  return resolved;
}

/** `null` only when the feature is disabled and PSI_ARCHIVE_ROOT was never set. */
function resolveArchiveRoot(config: ConfigService, enabled: boolean): string | null {
  const raw = config.get<string>('PSI_ARCHIVE_ROOT')?.trim();
  if (raw === undefined || raw === '') {
    if (enabled) {
      invalid('PSI_ARCHIVE_ROOT is required when PSI_DOWNLOAD_ENABLED=true');
    }
    return null;
  }
  return validateArchiveRootSyntax(raw);
}

@Injectable()
export class PropertySalesConfig {
  /** Master switch. Defaults to false everywhere until explicitly opted into. */
  readonly enabled: boolean;

  readonly downloadCronSchedule: string;
  readonly retentionCronSchedule: string;

  private readonly archiveRoot: string | null;

  readonly discoveryUrl: string;
  readonly weeklyLinkPattern: RegExp;
  readonly allowedDownloadHosts: readonly string[];

  /** Container has no display; flip only together with xvfb (see README § Known limitations). */
  readonly headless: boolean;
  readonly browserTimeoutMs: number;
  readonly downloadTimeoutMs: number;
  readonly maxArchiveBytes: number;
  /** Bounds a single sweep's catch-up so disk/runtime stay predictable. */
  readonly maxArchivesPerRun: number;
  /** How long a 'downloading' row may sit before a sweep reclaims it as abandoned. */
  readonly downloadStaleMinutes: number;

  readonly retentionDryRun: boolean;
  readonly retentionDays: number;
  /**
   * Escape hatch for ops only. Left false, retention NEVER selects a
   * `downloaded` (not yet `loaded`) archive regardless of age — that is the
   * guarantee KAN-242's hand-off depends on.
   */
  readonly retentionAllowUnloaded: boolean;
  /** Only consulted when retentionAllowUnloaded is true. */
  readonly retentionUnloadedDays: number;
  /** How long a quarantined file may sit in <archiveRoot>/quarantine before retention removes it. */
  readonly quarantineRetentionDays: number;
  /** How old an orphaned <archiveRoot>/staging/<runId>/ directory must be before retention reaps it. */
  readonly stagingMaxAgeHours: number;

  constructor(config: ConfigService) {
    this.enabled = readBool(config, 'PSI_DOWNLOAD_ENABLED', false);

    this.downloadCronSchedule = readCronExpression(config, 'PSI_DOWNLOAD_CRON_SCHEDULE', '0 3 * * 1');
    this.retentionCronSchedule = readCronExpression(config, 'PSI_RETENTION_CRON_SCHEDULE', '30 4 * * *');

    this.archiveRoot = resolveArchiveRoot(config, this.enabled);

    // The Valuer General's public bulk PSI listing: a plain HTML page of
    // absolute .zip links, no portal JavaScript, no login. Verified directly
    // (KAN-241 Phase 0 spike) to be reachable headless, with stealth.
    this.discoveryUrl = readString(
      config,
      'PSI_DISCOVERY_URL',
      'https://www.valuergeneral.nsw.gov.au/design/bulk_psi_content/bulk_psi',
    );

    // Anchored on the URL *path*, and narrow on purpose: the live listing
    // also serves ~36 yearly archives under /__psi/yearly/YYYY.zip, and a
    // bare `\.zip$` would match both.
    this.weeklyLinkPattern = compileWeeklyLinkPattern(
      readString(config, 'PSI_WEEKLY_LINK_PATTERN', String.raw`^/__psi/weekly/\d{8}\.zip$`),
    );

    this.allowedDownloadHosts = parseAllowedHosts(
      readString(
        config,
        'PSI_ALLOWED_DOWNLOAD_HOSTS',
        'valuation.property.nsw.gov.au,www.valuergeneral.nsw.gov.au,valuergeneral.nsw.gov.au',
      ),
    );

    this.headless = readBool(config, 'PSI_HEADLESS', true);
    this.browserTimeoutMs = readInt(config, 'PSI_BROWSER_TIMEOUT_MS', 60_000, { min: 1_000, max: 600_000 });
    this.downloadTimeoutMs = readInt(config, 'PSI_DOWNLOAD_TIMEOUT_MS', 300_000, { min: 1_000, max: 1_800_000 });
    this.maxArchiveBytes = readInt(config, 'PSI_MAX_ARCHIVE_BYTES', GIB, { min: 1, max: 64 * GIB });
    this.maxArchivesPerRun = readInt(config, 'PSI_MAX_ARCHIVES_PER_RUN', 5, { min: 1, max: 500 });
    this.downloadStaleMinutes = readInt(config, 'PSI_DOWNLOAD_STALE_MINUTES', 120, { min: 1, max: 10_080 });

    this.retentionDryRun = readBool(config, 'PSI_RETENTION_DRY_RUN', true);
    this.retentionDays = readInt(config, 'PSI_RETENTION_DAYS', 30, { min: 0, max: 3_650 });
    this.retentionAllowUnloaded = readBool(config, 'PSI_RETENTION_ALLOW_UNLOADED', false);
    this.retentionUnloadedDays = readInt(config, 'PSI_RETENTION_UNLOADED_DAYS', 180, { min: 0, max: 3_650 });
    this.quarantineRetentionDays = readInt(config, 'PSI_QUARANTINE_RETENTION_DAYS', 90, { min: 0, max: 3_650 });
    this.stagingMaxAgeHours = readInt(config, 'PSI_STAGING_MAX_AGE_HOURS', 24, { min: 1, max: 720 });
  }

  private requireArchiveRoot(): string {
    if (this.archiveRoot === null) {
      // Defensive only: every caller checks `.enabled` before ever reaching
      // a path that needs these directories.
      throw new InvalidConfigurationException('PSI_ARCHIVE_ROOT is not configured (feature disabled)');
    }
    return this.archiveRoot;
  }

  /** Final, validated archive files: `<releaseDate>-<filename>.zip`. Read by KAN-242. */
  get archivesDir(): string {
    return join(this.requireArchiveRoot(), 'archives');
  }

  /** Per-sweep `.part` staging, named by run id; same volume as archivesDir for an atomic rename. */
  get stagingDir(): string {
    return join(this.requireArchiveRoot(), 'staging');
  }

  /** Failed validations, kept (not deleted) for inspection: `<sha256>-<runId>.zip`. */
  get quarantineDir(): string {
    return join(this.requireArchiveRoot(), 'quarantine');
  }
}
