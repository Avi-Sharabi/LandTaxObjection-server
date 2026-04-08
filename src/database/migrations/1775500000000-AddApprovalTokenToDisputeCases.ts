import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApprovalTokenToDisputeCases1775500000000 implements MigrationInterface {
  name = 'AddApprovalTokenToDisputeCases1775500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        ADD COLUMN "client_approval_token"            uuid,
        ADD COLUMN "client_approval_token_expires_at" TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dispute_cases
        DROP COLUMN IF EXISTS "client_approval_token",
        DROP COLUMN IF EXISTS "client_approval_token_expires_at"
    `);
  }
}
