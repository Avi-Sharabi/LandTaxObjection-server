import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVerificationStatusAndConcessionClassification1783200000000 implements MigrationInterface {
  name = 'AddVerificationStatusAndConcessionClassification1783200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "dispute_objection_reasons" ADD COLUMN "concession_classification" text
    `);
    await queryRunner.query(`
      ALTER TABLE "dispute_objection_reasons" ADD COLUMN "verification_status" text
    `);
    await queryRunner.query(`
      ALTER TABLE "dispute_evidence_issues" ADD COLUMN "verification_status" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "dispute_evidence_issues" DROP COLUMN IF EXISTS "verification_status"`);
    await queryRunner.query(`ALTER TABLE "dispute_objection_reasons" DROP COLUMN IF EXISTS "verification_status"`);
    await queryRunner.query(`ALTER TABLE "dispute_objection_reasons" DROP COLUMN IF EXISTS "concession_classification"`);
  }
}
