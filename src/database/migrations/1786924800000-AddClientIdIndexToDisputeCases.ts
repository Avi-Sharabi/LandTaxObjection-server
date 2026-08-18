import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientIdIndexToDisputeCases1786924800000 implements MigrationInterface {
    name = 'AddClientIdIndexToDisputeCases1786924800000';

    // Postgres does not index FK child columns automatically, so every
    // `WHERE client_id = ...` on dispute_cases seq-scans today: the client detail relation
    // load, acceptTc, /dispute-cases/paginated?clientId=, and the cascade UPDATE in
    // ClientsService.remove(), which removeMany() runs once per client in its own
    // transaction. Named to match land_tax_dispute_schema_mvp.sql:344 (unreferenced by any
    // migration) so IF NOT EXISTS is genuinely idempotent if that file is ever applied.
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_dispute_cases_client" ON "dispute_cases" ("client_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_dispute_cases_client"`);
    }
}
