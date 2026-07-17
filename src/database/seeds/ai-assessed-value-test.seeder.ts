import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

const logger = new Logger('AiAssessedValueTestSeeder');

// Reuses the 5 Arvin dispute cases already seeded by seedCaseClosedNoObjection
// (case-closed-no-objection.seeder.ts) — backfills ai_assessed_value on them so
// the "AI Assessment Value" field on the Overview tab has something to show
// without needing a real AI analysis run. April's 5 cases are left untouched,
// so their Overview tab demonstrates the "—" not-yet-analyzed state instead.
const ARVIN_AI_ASSESSED_VALUES: { disputeCase: string; caseReference: string; aiAssessedValue: number }[] = [
  { disputeCase: 'f6878a58-dc1d-4539-9908-393a34e63768', caseReference: 'LTD-2026-ARV-001', aiAssessedValue: 781500.00 },
  { disputeCase: '44050838-1be9-430e-8d62-62f8e6c371f9', caseReference: 'LTD-2026-ARV-002', aiAssessedValue: 1101500.00 },
  { disputeCase: 'aed82772-8303-4360-a8b4-e950b5c52f1a', caseReference: 'LTD-2026-ARV-003', aiAssessedValue: 431500.00 },
  { disputeCase: '4bea0190-3fdc-4fa9-9bd4-de188a0272df', caseReference: 'LTD-2026-ARV-004', aiAssessedValue: 921500.00 },
  { disputeCase: '629f5d13-0a53-4009-8642-57f35b896cf1', caseReference: 'LTD-2026-ARV-005', aiAssessedValue: 1501500.00 },
];

export async function seedAiAssessedValueTest(dataSource: DataSource): Promise<void> {
  for (const c of ARVIN_AI_ASSESSED_VALUES) {
    const [existingCase] = await dataSource.query(`SELECT id FROM dispute_cases WHERE id = $1`, [c.disputeCase]);
    if (!existingCase) {
      logger.warn(`  Skipped ${c.caseReference} — dispute case not found (run seedCaseClosedNoObjection first)`);
      continue;
    }
    await dataSource.query(`UPDATE dispute_cases SET ai_assessed_value = $1 WHERE id = $2`, [c.aiAssessedValue, c.disputeCase]);
    logger.log(`  Set ai_assessed_value on ${c.caseReference}: $${c.aiAssessedValue.toLocaleString()}`);
  }
  logger.log('\n  → AI Assessment Value demo ready: LTD-2026-ARV-0xx cases show a populated value, LTD-2026-APR-0xx cases show the pending "—" state.');
}
