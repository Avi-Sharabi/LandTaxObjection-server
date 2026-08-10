import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDisputeCaseReferenceSequence1783400000000 implements MigrationInterface {
  name = 'CreateDisputeCaseReferenceSequence1783400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "dispute_case_reference_seq"`);

    // Seed the sequence past the highest sequence number ever issued — including soft-deleted
    // rows, since this is plain SQL and isn't subject to TypeORM's soft-delete filtering. Rows
    // whose case_reference doesn't match the expected "LTD-YYYY-NNNNNN" shape are ignored rather
    // than crashing the cast.
    await queryRunner.query(`
      SELECT setval(
        'dispute_case_reference_seq',
        COALESCE(
          (SELECT MAX(CAST(regexp_replace(case_reference, '^LTD-[0-9]{4}-', '') AS INTEGER))
           FROM dispute_cases
           WHERE case_reference ~ '^LTD-[0-9]{4}-[0-9]+$'),
          0
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "dispute_case_reference_seq"`);
  }
}
