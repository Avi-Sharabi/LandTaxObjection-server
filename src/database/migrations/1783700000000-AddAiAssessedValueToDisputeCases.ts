import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiAssessedValueToDisputeCases1783700000000 implements MigrationInterface {
  name = 'AddAiAssessedValueToDisputeCases1783700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "dispute_cases" ADD "ai_assessed_value" numeric(15,2)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "dispute_cases" DROP COLUMN "ai_assessed_value"`);
  }
}
