import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEvidenceStrengthRationaleToDisputeCases1785157318686 implements MigrationInterface {
  name = 'AddEvidenceStrengthRationaleToDisputeCases1785157318686';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "dispute_cases" ADD "evidence_strength_rationale" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "dispute_cases" DROP COLUMN "evidence_strength_rationale"`);
  }
}
