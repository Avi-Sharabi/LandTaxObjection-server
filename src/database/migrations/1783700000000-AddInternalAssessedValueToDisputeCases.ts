import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInternalAssessedValueToDisputeCases1783700000000 implements MigrationInterface {
  name = 'AddInternalAssessedValueToDisputeCases1783700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "dispute_cases" ADD "internal_assessed_value" numeric(15,2)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "dispute_cases" DROP COLUMN "internal_assessed_value"`);
  }
}
