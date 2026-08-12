import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDisputeCaseReferenceSequence1783400000000 implements MigrationInterface {
  name = 'CreateDisputeCaseReferenceSequence1783400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "dispute_case_reference_seq"`);

    // Seed the sequence past the highest sequence number ever issued — including soft-deleted
    // rows, since this is plain SQL and isn't subject to TypeORM's soft-delete filtering. Rows
    // whose case_reference doesn't match the expected "LTD-YYYY-NNNNNN" shape are ignored rather
    // than crashing the cast. When no rows match (fresh database), setval's minimum bound of 1
    // means we must seed with is_called=false so the first nextval() still returns 1.
    await queryRunner.query(`
      DO $$
      DECLARE
        max_ref INTEGER;
      BEGIN
        SELECT MAX(CAST(regexp_replace(case_reference, '^LTD-[0-9]{4}-', '') AS INTEGER))
        INTO max_ref
        FROM dispute_cases
        WHERE case_reference ~ '^LTD-[0-9]{4}-[0-9]+$';

        IF max_ref IS NULL THEN
          PERFORM setval('dispute_case_reference_seq', 1, false);
        ELSE
          PERFORM setval('dispute_case_reference_seq', max_ref);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "dispute_case_reference_seq"`);
  }
}
