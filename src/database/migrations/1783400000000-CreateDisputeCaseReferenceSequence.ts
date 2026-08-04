import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDisputeCaseReferenceSequence1783400000000 implements MigrationInterface {
  name = 'CreateDisputeCaseReferenceSequence1783400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "dispute_case_reference_seq"`);

    // Seed the sequence past the highest sequence number ever issued — including soft-deleted
    // rows, since this is plain SQL and isn't subject to TypeORM's soft-delete filtering. Rows
    // whose case_reference doesn't match the expected "LTD-YYYY-NNNNNN" shape are ignored rather
    // than crashing the cast. When no rows match (e.g. a fresh database), max_ref is NULL, so
    // is_called is set to false to seed the sequence at 1 rather than calling setval(seq, 0),
    // which errors since sequences have a minimum value of 1.
    await queryRunner.query(`
      SELECT setval(
        'dispute_case_reference_seq',
        COALESCE(max_ref, 1),
        max_ref IS NOT NULL
      )
      FROM (
        SELECT MAX(CAST(regexp_replace(case_reference, '^LTD-[0-9]{4}-', '') AS INTEGER)) AS max_ref
        FROM dispute_cases
        WHERE case_reference ~ '^LTD-[0-9]{4}-[0-9]+$'
      ) AS t
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "dispute_case_reference_seq"`);
  }
}
