import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { seedAccuracyR1R4 } from './accuracy-r1-r4.seeder';
import { seedAccuracyR5R8 } from './accuracy-r5-r8.seeder';
import { seedAccuracyR9 } from './accuracy-r9.seeder';
import { seedAccuracyGap } from './accuracy-gap.seeder';

/**
 * Master seeder for the ROO Accuracy Test Suite (v0.6).
 *
 * Seeds 50 dispute cases with pre-built dispute_ai_snapshots contexts, grouped by objection reason.
 * When analyze-ai runs on any of these cases, the processor reads the snapshot and skips
 * PropertyContextService.gather() and gatherEntityEvidence(), so Claude generation runs against
 * fixed, deterministic inputs without external credentials.
 *
 * UUID scheme: acc00001-NNNN-4000-a000-000000000TTT
 *   NNNN = 4-digit sequence (0001–0050)
 *   TTT  = 001 client | 002 property | 003 assessmentDoc | 004 valuationNotice | 005 disputeCase
 *
 * Seeded groups:
 *   Seq 01–03  ACC-R1-001..003  Ground 1 — Too High           (accuracy-r1-r4.seeder.ts)
 *   Seq 04–06  ACC-R2-001..003  Ground 2 — Too Low            (accuracy-r1-r4.seeder.ts)
 *   Seq 07–08  ACC-R3-001..002  Ground 3 — Area Incorrect     (accuracy-r1-r4.seeder.ts)
 *   Seq 09–10  ACC-R4-001..002  Ground 4 — Description        (accuracy-r1-r4.seeder.ts)
 *   Seq 11–13  ACC-R5-001..003  Ground 7 — Wrong Person       (accuracy-r5-r8.seeder.ts)
 *   Seq 14–18  ACC-R6-001..005  Ground 6 — Apportionment      (accuracy-r5-r8.seeder.ts)
 *   Seq 19–20  ACC-R7-001..002  Ground 5 — With Other Land    (accuracy-r5-r8.seeder.ts)
 *   Seq 21–22  ACC-R8-001..002  Ground 8 — Separately         (accuracy-r5-r8.seeder.ts)
 *   Seq 23–37  ACC-R9-001..015  Ground 9 — Concessions × 15  (accuracy-r9.seeder.ts)
 *   Seq 38–40  ADV-001..003     Adversarial                   (accuracy-gap.seeder.ts)
 *   Seq 41–43  CRX-001..003     Cross-Reason                  (accuracy-gap.seeder.ts)
 *   Seq 44–46  MIS-001..003     Missing Data                  (accuracy-gap.seeder.ts)
 *   Seq 47–48  INV-001..002     Inverse Concession            (accuracy-gap.seeder.ts)
 *   Seq 49–50  R1X-001, R2X-001 Edge Cases                   (accuracy-gap.seeder.ts)
 *
 * To test a specific case after seeding:
 *   POST /api/dispute-cases/<disputeCaseId>/analyze-ai
 *   GET  /api/dispute-cases/<disputeCaseId>/objection-reasons
 *
 * Example (ACC-R1-001):
 *   disputeCaseId = acc00001-0001-4000-a000-000000000005
 */

export const ACCURACY_DISPUTE_CASE_IDS: string[] = [
  'acc00001-0001-4000-a000-000000000005',
  'acc00001-0002-4000-a000-000000000005',
  'acc00001-0003-4000-a000-000000000005',
  'acc00001-0004-4000-a000-000000000005',
  'acc00001-0005-4000-a000-000000000005',
  'acc00001-0007-4000-a000-000000000005',
  'acc00001-0008-4000-a000-000000000005',
  'acc00001-0009-4000-a000-000000000005',
  'acc00001-0010-4000-a000-000000000005',
  'acc00001-0011-4000-a000-000000000005',
  'acc00001-0012-4000-a000-000000000005',
  'acc00001-0013-4000-a000-000000000005',
  'acc00001-0014-4000-a000-000000000005',
  'acc00001-0015-4000-a000-000000000005',
  'acc00001-0016-4000-a000-000000000005',
  'acc00001-0017-4000-a000-000000000005',
  'acc00001-0019-4000-a000-000000000005',
  'acc00001-0020-4000-a000-000000000005',
  'acc00001-0021-4000-a000-000000000005',
  'acc00001-0022-4000-a000-000000000005',
  'acc00001-0023-4000-a000-000000000005',
  'acc00001-0024-4000-a000-000000000005',
  'acc00001-0025-4000-a000-000000000005',
  'acc00001-0026-4000-a000-000000000005',
  'acc00001-0027-4000-a000-000000000005',
  'acc00001-0028-4000-a000-000000000005',
  'acc00001-0029-4000-a000-000000000005',
  'acc00001-0030-4000-a000-000000000005',
  'acc00001-0031-4000-a000-000000000005',
  'acc00001-0032-4000-a000-000000000005',
  'acc00001-0033-4000-a000-000000000005',
  'acc00001-0034-4000-a000-000000000005',
  'acc00001-0035-4000-a000-000000000005',
  'acc00001-0036-4000-a000-000000000005',
  'acc00001-0037-4000-a000-000000000005',
  'acc00001-0038-4000-a000-000000000005',
  'acc00001-0039-4000-a000-000000000005',
  'acc00001-0040-4000-a000-000000000005',
  'acc00001-0041-4000-a000-000000000005',
  'acc00001-0042-4000-a000-000000000005',
  'acc00001-0043-4000-a000-000000000005',
  'acc00001-0044-4000-a000-000000000005',
  'acc00001-0045-4000-a000-000000000005',
  'acc00001-0046-4000-a000-000000000005',
  'acc00001-0047-4000-a000-000000000005',
  'acc00001-0048-4000-a000-000000000005',
  'acc00001-0049-4000-a000-000000000005',
  'acc00001-0050-4000-a000-000000000005',
  'acc00001-0051-4000-a000-000000000005',
  'acc00001-0052-4000-a000-000000000005',
  'acc00001-0053-4000-a000-000000000005',
  'acc00001-0054-4000-a000-000000000005',
  'acc00001-0055-4000-a000-000000000005',
  'acc00001-0056-4000-a000-000000000005',
  'acc00001-0057-4000-a000-000000000005',
  'acc00001-0058-4000-a000-000000000005',
]; // 56 total

const logger = new Logger('AccuracyTestSeeder');

export async function seedAccuracyTests(dataSource: DataSource): Promise<void> {
  logger.log('\n════════════════════════════════════════════════════════════════');
  logger.log('  ROO Accuracy Test Suite v0.6 — seeding 50 scenarios');
  logger.log('════════════════════════════════════════════════════════════════');

  await seedAccuracyR1R4(dataSource);
  await seedAccuracyR5R8(dataSource);
  await seedAccuracyR9(dataSource);
  await seedAccuracyGap(dataSource);

  logger.log('\n════════════════════════════════════════════════════════════════');
  logger.log('  Accuracy test seeding complete — 50 cases seeded');
  logger.log('════════════════════════════════════════════════════════════════\n');
}
