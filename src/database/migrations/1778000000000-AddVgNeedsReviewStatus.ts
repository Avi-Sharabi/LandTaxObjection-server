import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVgNeedsReviewStatus1778000000000 implements MigrationInterface {
  name = 'AddVgNeedsReviewStatus1778000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "dispute_cases_status_enum" ADD VALUE IF NOT EXISTS 'for_review'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values; handled by a full enum replacement if rollback is required
  }
}
