import { MigrationInterface, QueryRunner } from 'typeorm';

// Distinguishes what an `analyze-ai` job should do when a dispute_ai_snapshots row exists:
// 'ground_analysis' (default) — the existing 56-scenario accuracy suite. Skips ePlanning/
//   comparables/evidence gathering, runs the real ground-generation LLM call unconditionally,
//   and skips valuation report generation entirely.
// 'report_generation' — skips the ground-generation LLM call too (grounds must be pre-seeded
//   directly into dispute_objection_reasons) and, unlike 'ground_analysis', DOES run
//   valuationReportService.generate().
export class AddSnapshotModeToDisputeAiSnapshots1784000000000
  implements MigrationInterface
{
  name = 'AddSnapshotModeToDisputeAiSnapshots1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "dispute_ai_snapshots"
        ADD COLUMN "snapshot_mode" text NOT NULL DEFAULT 'ground_analysis'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "dispute_ai_snapshots" DROP COLUMN IF EXISTS "snapshot_mode"`,
    );
  }
}
