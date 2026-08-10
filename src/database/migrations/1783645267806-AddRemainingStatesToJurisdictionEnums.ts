import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRemainingStatesToJurisdictionEnums1783645267806 implements MigrationInterface {
  name = 'AddRemainingStatesToJurisdictionEnums1783645267806';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "dispute_cases_jurisdiction_enum" ADD VALUE IF NOT EXISTS 'SA'`);
    await queryRunner.query(`ALTER TYPE "dispute_cases_jurisdiction_enum" ADD VALUE IF NOT EXISTS 'TAS'`);
    await queryRunner.query(`ALTER TYPE "dispute_cases_jurisdiction_enum" ADD VALUE IF NOT EXISTS 'ACT'`);
    await queryRunner.query(`ALTER TYPE "dispute_cases_jurisdiction_enum" ADD VALUE IF NOT EXISTS 'NT'`);

    await queryRunner.query(`ALTER TYPE "properties_state_enum" ADD VALUE IF NOT EXISTS 'SA'`);
    await queryRunner.query(`ALTER TYPE "properties_state_enum" ADD VALUE IF NOT EXISTS 'TAS'`);
    await queryRunner.query(`ALTER TYPE "properties_state_enum" ADD VALUE IF NOT EXISTS 'ACT'`);
    await queryRunner.query(`ALTER TYPE "properties_state_enum" ADD VALUE IF NOT EXISTS 'NT'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values; handled by a full enum replacement if rollback is required
  }
}
