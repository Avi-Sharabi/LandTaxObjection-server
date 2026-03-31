import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClosedNoObjectionStatus1775300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE dispute_cases_status_enum ADD VALUE IF NOT EXISTS 'closed_no_objection'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not natively support removing a single enum value.
    // We recreate the type without 'closed_no_objection', remapping any rows that use it
    // to 'closed' before the type is swapped.
    await queryRunner.startTransaction();

    try {
      // Step 1: Remap any rows using the value we are removing
      await queryRunner.query(`
        UPDATE dispute_cases
        SET status = 'closed'
        WHERE status = 'closed_no_objection'
      `);

      // Step 2: Rename existing enum to a temporary name
      await queryRunner.query(`
        ALTER TYPE dispute_cases_status_enum RENAME TO dispute_cases_status_enum_old
      `);

      // Step 3: Recreate the enum without the removed value
      await queryRunner.query(`
        CREATE TYPE dispute_cases_status_enum AS ENUM (
          'draft',
          'grounds_selection',
          'evidence_compilation',
          'appraisal',
          'advisory_letter_issued',
          'objection_package_prepared',
          'awaiting_client_approval',
          'submitted_to_vg',
          'awaiting_vg_response',
          'outcome_received',
          'closed'
        )
      `);

      // Step 4: Migrate the column to use the new enum type
      await queryRunner.query(`
        ALTER TABLE dispute_cases
          ALTER COLUMN status TYPE dispute_cases_status_enum
          USING status::text::dispute_cases_status_enum
      `);

      // Step 5: Reset the column default to ensure it references the new type
      await queryRunner.query(`
        ALTER TABLE dispute_cases
          ALTER COLUMN status SET DEFAULT 'draft'
      `);

      // Step 6: Drop the old enum type
      await queryRunner.query(`
        DROP TYPE dispute_cases_status_enum_old
      `);

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    }
  }
}