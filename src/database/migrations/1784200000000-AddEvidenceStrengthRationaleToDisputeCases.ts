import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEvidenceStrengthRationaleToDisputeCases1784200000000 implements MigrationInterface {
  name = 'AddEvidenceStrengthRationaleToDisputeCases1784200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // One-sentence explanation of evidence_strength_score, written by the same Claude call that
    // produces the score. The score column itself already exists (CreateBaseTables).
    //
    // IF NOT EXISTS because an equivalent generated migration
    // (AddEvidenceStrengthRationaleToDisputeCases1785157318686) was already applied to the dev
    // database and then removed from the tree, so the column can pre-exist while this migration is
    // still unrun. Without the guard, `migration:run` aborts on 42701 duplicate_column. The file
    // has to stay so fresh databases (QA/prod) still get the column — CreateBaseTables lacks it.
    await queryRunner.query(
      `ALTER TABLE "dispute_cases" ADD COLUMN IF NOT EXISTS "evidence_strength_rationale" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "dispute_cases" DROP COLUMN IF EXISTS "evidence_strength_rationale"`,
    );
  }
}
