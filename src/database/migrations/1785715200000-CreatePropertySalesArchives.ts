import { MigrationInterface, QueryRunner } from 'typeorm';

// KAN-241: ledger for the NSW Property Sales weekly archive download job.
//
// This is a NEW, standalone table — it does not touch `property_sales_raw`
// (which this repo's 59 other migrations have never created; it is loaded
// out-of-band today) and carries no foreign key to it. `property_sales_raw`
// remains untouched by this ticket end to end.
//
// The status set already includes 'loading' / 'loaded' / 'load_failed' and
// the loaded_at column, even though KAN-241 (this ticket) only ever writes
// 'discovered' | 'downloading' | 'downloaded' | 'download_failed' |
// 'quarantined' | 'deleted' — so KAN-242 (parse + load into
// property_sales_raw) can plug in against this same table without a
// follow-up migration.
export class CreatePropertySalesArchives1785715200000 implements MigrationInterface {
  name = 'CreatePropertySalesArchives1785715200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "property_sales_archives" (
        "id"                  uuid NOT NULL DEFAULT gen_random_uuid(),
        "source_url"          text NOT NULL,
        "archive_filename"    text NOT NULL,
        "release_date"        date NOT NULL,
        "status"              text NOT NULL DEFAULT 'discovered',
        "local_path"          text,
        "size_bytes"          bigint,
        "sha256"              char(64),
        "entry_count"         integer,
        "discovered_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "download_started_at" TIMESTAMP WITH TIME ZONE,
        "downloaded_at"       TIMESTAMP WITH TIME ZONE,
        "loaded_at"           TIMESTAMP WITH TIME ZONE,
        "deleted_at"          TIMESTAMP WITH TIME ZONE,
        "error_code"          text,
        "error_message"       text,
        "attempt_count"       integer NOT NULL DEFAULT 0,
        "created_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_property_sales_archives" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_property_sales_archives_source_url" UNIQUE ("source_url"),
        CONSTRAINT "CHK_property_sales_archives_status" CHECK ("status" IN
          ('discovered', 'downloading', 'downloaded', 'download_failed',
           'quarantined', 'loading', 'loaded', 'load_failed', 'deleted'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_property_sales_archives_status" ON "property_sales_archives" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_property_sales_archives_release_date" ON "property_sales_archives" ("release_date" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_property_sales_archives_sha256" ON "property_sales_archives" ("sha256")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "property_sales_archives"`);
  }
}
