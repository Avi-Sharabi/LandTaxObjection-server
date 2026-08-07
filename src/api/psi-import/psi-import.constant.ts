import { join } from 'path';

/** Log prefix, matching the `[CLEANUP]` / `[APPROVAL-REMINDER]` convention used by other tasks. */
export const PSI_LOG_TAG = '[PSI-IMPORT]';

/** NSW Valuer General bulk Property Sales Information listing. */
export const PSI_LISTING_URL =
  'https://www.valuergeneral.nsw.gov.au/design/bulk_psi_content/bulk_psi';

/** Panel holding the weekly (as opposed to annual/archive) download links. */
export const PSI_WEEKLY_PANEL_SELECTOR = 'div.panel-body.weekly a[href]';

/**
 * Downloads land beside `ormlogs.log` at the repo root — never under `dist/`, which
 * nest-cli.json wipes on every build via `"deleteOutDir": true`.
 */
export const PSI_DOWNLOAD_ROOT = join(process.cwd(), 'psi-downloads');

/** Subfolder within a run directory that holds the extracted archives and .DAT files. */
export const PSI_EXTRACT_DIRNAME = 'extracted';

/**
 * Production schedule: 08:00 every Monday, Sydney local time.
 *
 * Override with the `PSI_IMPORT_CRON` env var — QA sets a short interval so the job can be
 * exercised without waiting for Monday. Leave it unset in production to get the weekly default.
 */
export const PSI_IMPORT_CRON_DEFAULT = '0 8 * * 1';
export const PSI_IMPORT_CRON_ENV_KEY = 'PSI_IMPORT_CRON';

/**
 * Applied to whatever expression is in force, so 08:00 stays 08:00 across the AEST/AEDT
 * boundary. Other tasks in this repo bake the offset into a UTC expression and drift an hour for
 * half the year.
 */
export const PSI_IMPORT_CRON_TIMEZONE = 'Australia/Sydney';
export const PSI_IMPORT_CRON_NAME = 'psi-weekly-import';

/** Redis lock guarding against a double-fire if the app is ever scaled past one instance. */
export const PSI_IMPORT_LOCK_KEY = 'psi:import:lock';
export const PSI_IMPORT_LOCK_TTL_SECONDS = 3600;

/**
 * How long to wait for the shared Redis client to become usable before giving up on the lock.
 * The client is configured with `lazyConnect`, so the connection is established on first use.
 */
export const REDIS_READY_TIMEOUT_MS = 10_000;

/** Desktop UA, matching the one the existing scrapers in puppeteer.service.ts already send. */
export const PSI_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const PSI_PAGE_TIMEOUT_MS = 45_000;
export const PSI_DOWNLOAD_TIMEOUT_MS = 300_000;

/**
 * Archive nesting depth guard: the weekly bundle holds one archive per Local Government Area,
 * and the .DAT files live inside those — two levels. The cap stops a malformed archive looping.
 */
export const PSI_MAX_ARCHIVE_DEPTH = 2;

/**
 * The only record type that maps to a `property_sales_raw` row. Every B record is self-contained
 * — it carries its own `district_code` and `download_datetime` — so the A header adds nothing.
 * A/C/D/Z lines are counted as skipped and otherwise ignored.
 */
export const PSI_RECORD_TYPE_SALE = 'B';

export const PSI_FIELD_DELIMITER = ';';
