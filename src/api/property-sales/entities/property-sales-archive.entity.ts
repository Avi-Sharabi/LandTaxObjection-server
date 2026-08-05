import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// KAN-241: one row per NSW Valuer General weekly PSI archive the download
// job has ever seen. This table is the ONLY thing this ticket writes to —
// it does not touch `property_sales_raw`, which is populated out-of-band
// today and is read by comparables.service.ts, the MCP search-comparables
// tool, and the locality-centroid geocoder. See the migration
// (1785715200000-CreatePropertySalesArchives) for the full status lifecycle
// and why 'loading' / 'loaded' / 'load_failed' already exist even though
// this ticket never sets them — that is KAN-242's hand-off.
export type PropertySalesArchiveStatus =
  | 'discovered'
  | 'downloading'
  | 'downloaded'
  | 'download_failed'
  | 'quarantined'
  | 'loading'
  | 'loaded'
  | 'load_failed'
  | 'deleted';

@Entity('property_sales_archives')
export class PropertySalesArchive {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The weekly archive's absolute source URL, e.g.
  // https://www.valuergeneral.nsw.gov.au/__psi/weekly/20260803.zip
  // UNIQUE — intended as the future DB-level dedupe key once a write path
  // exists; today's in-memory equivalent is archive-candidate.util.ts's
  // dedupeCandidates (per-run only, since nothing persists anything yet —
  // see PropertySalesRepository.readLoadedReleaseDates's doc comment).
  @Column({ type: 'text', nullable: false, unique: true })
  source_url: string;

  @Column({ type: 'text', nullable: false })
  archive_filename: string;

  // YYYY-MM-DD, parsed from the source URL/label. Not a timestamp — the VG
  // feed publishes one release per calendar date.
  @Column({ type: 'date', nullable: false })
  release_date: string;

  @Column({ type: 'text', nullable: false, default: 'discovered' })
  status: PropertySalesArchiveStatus;

  @Column({ type: 'text', nullable: true })
  local_path: string | null;

  // bigint columns come back from `pg` as strings, not numbers — convert at
  // the read boundary, never assume this is a JS number.
  @Column({ type: 'bigint', nullable: true })
  size_bytes: string | null;

  @Column({ type: 'char', length: 64, nullable: true })
  sha256: string | null;

  @Column({ type: 'integer', nullable: true })
  entry_count: number | null;

  // Domain timestamp (when this URL was first seen on the listing) — kept
  // distinct from the entity's own created_at/updated_at audit pair below.
  // DB-defaulted to now(); not a TypeORM @CreateDateColumn.
  @Column({ type: 'timestamptz', nullable: false })
  discovered_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  download_started_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  downloaded_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  loaded_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deleted_at: Date | null;

  @Column({ type: 'text', nullable: true })
  error_code: string | null;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @Column({ type: 'integer', nullable: false, default: 0 })
  attempt_count: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
