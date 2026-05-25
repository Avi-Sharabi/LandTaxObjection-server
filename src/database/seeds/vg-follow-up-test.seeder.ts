import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from 'src/api/users/entities/user.entity';

const logger = new Logger('VgFollowUpTestSeeder');

// ─── Shared entity IDs ────────────────────────────────────────────────────────
const IDS = {
  client:             'a1b2c3d4-f000-4000-b000-000000000001',
  property:           'a1b2c3d4-f000-4000-b000-000000000002',
  assessmentDocument: 'a1b2c3d4-f000-4000-b000-000000000003',
  valuationNotice:    'a1b2c3d4-f000-4000-b000-000000000004',

  // One case per test scenario
  caseT1Happy:      'a1b2c3d4-f000-4000-b000-000000000010',
  caseT2TooRecent:  'a1b2c3d4-f000-4000-b000-000000000020',
  caseT3TooOld:     'a1b2c3d4-f000-4000-b000-000000000030',
  caseT4NoAssessor: 'a1b2c3d4-f000-4000-b000-000000000040',
  caseT5VgReceived: 'a1b2c3d4-f000-4000-b000-000000000050',
  caseT6Cadence:    'a1b2c3d4-f000-4000-b000-000000000060',
  caseT7Boundary:   'a1b2c3d4-f000-4000-b000-000000000070',
} as const;

type CaseId = typeof IDS[keyof typeof IDS];

interface ScenarioCase {
  id: CaseId;
  ref: string;
  // submitted_at offset in days from now (negative = past)
  submittedDaysAgo: number;
  status: string;
  lastFollowUpDaysAgo: number | null;
  followUpCount: number;
  // null = no assigned assessor (Test 4)
  assignedAccountantId: string | null;
  lodgmentRef: string | null;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function upsertCase(
  dataSource: DataSource,
  c: ScenarioCase,
  description: string,
): Promise<void> {
  const submittedAt     = daysAgo(c.submittedDaysAgo);
  const lastFollowUpAt  = c.lastFollowUpDaysAgo !== null ? daysAgo(c.lastFollowUpDaysAgo) : null;

  const [existing] = await dataSource.query(
    `SELECT id FROM dispute_cases WHERE id = $1`, [c.id],
  );

  if (!existing) {
    await dataSource.query(`
      INSERT INTO dispute_cases
        (id, case_reference, client_id, property_id, valuation_notice_id,
         assigned_accountant_id, jurisdiction, status, statutory_deadline,
         no_legal_ground_flagged, submitted_at, lodgment_reference_number,
         last_vg_follow_up_sent_at, vg_follow_up_count)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    `, [
      c.id, c.ref, IDS.client, IDS.property, IDS.valuationNotice,
      c.assignedAccountantId, 'VIC', c.status, '2027-06-30',
      false, submittedAt, c.lodgmentRef,
      lastFollowUpAt, c.followUpCount,
    ]);
    logger.log(`  Seeded  ${c.ref}  [${description}]`);
  } else {
    // Always reset so re-running the seeder restores the test precondition
    await dataSource.query(`
      UPDATE dispute_cases SET
        status                    = $1,
        submitted_at              = $2,
        last_vg_follow_up_sent_at = $3,
        vg_follow_up_count        = $4,
        assigned_accountant_id    = $5,
        lodgment_reference_number = $6
      WHERE id = $7
    `, [c.status, submittedAt, lastFollowUpAt, c.followUpCount, c.assignedAccountantId, c.lodgmentRef, c.id]);

    // Remove any audit rows written by previous test runs so counts are predictable
    await dataSource.query(`
      DELETE FROM audit_logs
      WHERE case_id = $1 AND performed_by = '00000000-0000-0000-0000-000000000000'
    `, [c.id]);

    logger.log(`  Reset   ${c.ref}  [${description}]`);
  }
}

export async function seedVgFollowUpTest(dataSource: DataSource): Promise<void> {
  // ── 1. Resolve assessor ──────────────────────────────────────────────────────
  const assessor = await dataSource
    .getRepository(User)
    .findOneBy({ email: 'pol.imbing@ymlgroup.com.au' });
  if (!assessor) {
    throw new Error('[VgFollowUpTestSeeder] pol.imbing not found — run seedUsers() first.');
  }
  logger.log(`Resolved assessor: ${assessor.fullName} (${assessor.id})`);

  // ── 2. Shared client ─────────────────────────────────────────────────────────
  const [existingClient] = await dataSource.query(
    `SELECT id FROM clients WHERE id = $1`, [IDS.client],
  );
  if (!existingClient) {
    await dataSource.query(`
      INSERT INTO clients (id, name, email, status, assigned_accountant_id)
      VALUES ($1, $2, $3, $4, $5)
    `, [IDS.client, 'FUP Test Client', assessor.email, 'active', assessor.id]);
    logger.log('  Seeded shared client');
  }

  // ── 3. Shared property ───────────────────────────────────────────────────────
  const [existingProperty] = await dataSource.query(
    `SELECT id FROM properties WHERE id = $1`, [IDS.property],
  );
  if (!existingProperty) {
    await dataSource.query(`
      INSERT INTO properties
        (id, client_id, address, suburb, state, postcode, pid, ownership_pct, land_area_sqm, zoning)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [IDS.property, IDS.client, '99 Follow-Up Street', 'Melbourne', 'VIC', '3000', '9900099', 100.00, null, null]);
    logger.log('  Seeded shared property');
  }

  // ── 4. Shared assessment document ────────────────────────────────────────────
  const [existingDoc] = await dataSource.query(
    `SELECT id FROM assessment_documents WHERE id = $1`, [IDS.assessmentDocument],
  );
  if (!existingDoc) {
    await dataSource.query(`
      INSERT INTO assessment_documents (id, client_id, file_path, document_name)
      VALUES ($1,$2,$3,$4)
    `, [IDS.assessmentDocument, IDS.client, `dispute-cases/${IDS.assessmentDocument}/valuation-notice.pdf`, 'Valuation Notice']);
    logger.log('  Seeded shared assessment document');
  }

  // ── 5. Shared valuation notice ───────────────────────────────────────────────
  const [existingNotice] = await dataSource.query(
    `SELECT id FROM valuation_notices WHERE id = $1`, [IDS.valuationNotice],
  );
  if (!existingNotice) {
    await dataSource.query(`
      INSERT INTO valuation_notices
        (id, property_id, source_document_id, appraised_by_id, valuation_date,
         assessed_land_value, appraised_value, valuation_delta, decision_outcome,
         is_exempt, notice_reference, analyst_notes, appraised_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `, [
      IDS.valuationNotice, IDS.property, IDS.assessmentDocument, assessor.id,
      '2024-07-01', 2_000_000, 1_600_000, -400_000,
      'ADVISORY', false, 'SEED-FUP-NOTICE-001', '', new Date().toISOString(),
    ]);
    logger.log('  Seeded shared valuation notice');
  }

  // ── 6. Test cases ─────────────────────────────────────────────────────────────
  const scenarios: Array<[ScenarioCase, string]> = [
    [
      {
        id: IDS.caseT1Happy,
        ref: 'FUPTEST-T1-HAPPY',
        status: 'submitted_to_vg',
        submittedDaysAgo: 91,
        lastFollowUpDaysAgo: null,
        followUpCount: 0,
        assignedAccountantId: assessor.id,
        lodgmentRef: 'LR-FUP-T1-0001',
      },
      'T1 — happy path: 91 days old, no follow-up yet → due for first follow-up [PICKED]',
    ],
    [
      {
        id: IDS.caseT2TooRecent,
        ref: 'FUPTEST-T2-EARLY',
        status: 'submitted_to_vg',
        submittedDaysAgo: 89,
        lastFollowUpDaysAgo: null,
        followUpCount: 0,
        assignedAccountantId: assessor.id,
        lodgmentRef: 'LR-FUP-T2-0001',
      },
      'T2 — 89 days old, no follow-up yet → not 90 days yet, skip [SKIPPED]',
    ],
    [
      {
        id: IDS.caseT3TooOld,
        ref: 'FUPTEST-T3-REPEAT',
        status: 'submitted_to_vg',
        submittedDaysAgo: 100,
        lastFollowUpDaysAgo: 6,
        followUpCount: 1,
        assignedAccountantId: assessor.id,
        lodgmentRef: 'LR-FUP-T3-0001',
      },
      'T3 — repeat: last follow-up 6 days ago → due for follow-up #2 [PICKED]',
    ],
    [
      {
        id: IDS.caseT4NoAssessor,
        ref: 'FUPTEST-T4-NOASGN',
        status: 'submitted_to_vg',
        submittedDaysAgo: 91,
        lastFollowUpDaysAgo: null,
        followUpCount: 0,
        assignedAccountantId: null,
        lodgmentRef: 'LR-FUP-T4-0001',
      },
      'T4 — no assigned assessor: picked by query, email skipped, audit written [PICKED/no email]',
    ],
    [
      {
        id: IDS.caseT5VgReceived,
        ref: 'FUPTEST-T5-VGRECV',
        status: 'vg_response_received',
        submittedDaysAgo: 91,
        lastFollowUpDaysAgo: null,
        followUpCount: 0,
        assignedAccountantId: assessor.id,
        lodgmentRef: 'LR-FUP-T5-0001',
      },
      'T5 — wrong status (vg_response_received) → excluded by status filter [SKIPPED]',
    ],
    [
      {
        id: IDS.caseT6Cadence,
        ref: 'FUPTEST-T6-TOOSOON',
        status: 'submitted_to_vg',
        submittedDaysAgo: 100,
        lastFollowUpDaysAgo: 3,
        followUpCount: 1,
        assignedAccountantId: assessor.id,
        lodgmentRef: 'LR-FUP-T6-0001',
      },
      'T6 — repeat too soon: last follow-up only 3 days ago → 5-day gate [SKIPPED]',
    ],
    [
      {
        id: IDS.caseT7Boundary,
        ref: 'FUPTEST-T7-MAXCOUNT',
        status: 'submitted_to_vg',
        submittedDaysAgo: 125,
        lastFollowUpDaysAgo: 6,
        followUpCount: 5,
        assignedAccountantId: assessor.id,
        lodgmentRef: 'LR-FUP-T7-0001',
      },
      'T7 — max follow-ups reached (count=5) → excluded by count cap [SKIPPED]',
    ],
  ];

  for (const [scenario, description] of scenarios) {
    await upsertCase(dataSource, scenario, description);
  }

  logger.log(`
  ┌──────────────────────────────────────────────────────────────────────────────────────────┐
  │  VG Follow-Up Test Seeder — ready                                                        │
  │                                                                                          │
  │  Trigger:  POST /v1/dispute-cases/internal/run-vg-follow-up  (admin JWT required)        │
  │            { "email": "landtaxdispute@ymlgroup.com.au", "password": "Admin@123" }        │
  │                                                                                          │
  │  Expected results per trigger call:                                                      │
  │  ┌─────────────────────────┬─────────────────────────────────────────┬──────┬────────┐  │
  │  │ Case                    │ Scenario                                 │ Sent │ Audit  │  │
  │  ├─────────────────────────┼─────────────────────────────────────────┼──────┼────────┤  │
  │  │ FUPTEST-T1-HAPPY        │ 91 days, no prior → follow-up #1        │  yes │  yes   │  │
  │  │ FUPTEST-T2-EARLY        │ 89 days, no prior → too early, SKIP     │  no  │  no    │  │
  │  │ FUPTEST-T3-REPEAT       │ Last sent 6 days ago → follow-up #2     │  yes │  yes   │  │
  │  │ FUPTEST-T4-NOASGN       │ No assessor — email skipped, audit yes  │  no  │  yes   │  │
  │  │ FUPTEST-T5-VGRECV       │ Status vg_response_received → SKIP      │  no  │  no    │  │
  │  │ FUPTEST-T6-TOOSOON      │ Last sent 3 days ago → 5-day gate, SKIP │  no  │  no    │  │
  │  │ FUPTEST-T7-MAXCOUNT     │ count=5 → max reached, SKIP             │  no  │  no    │  │
  │  └─────────────────────────┴─────────────────────────────────────────┴──────┴────────┘  │
  │                                                                                          │
  │  Response should be: { "checked": 3, "sent": 2, "failed": 0 }                           │
  │  VG inbox (VG_SUBMISSION_EMAIL) should receive 2 emails:                    │
  │    [FUPTEST-T1-HAPPY]   Follow-Up Enquiry #1                                │
  │    [FUPTEST-T3-REPEAT]  Follow-Up Enquiry #2                                │
  │  Assessor (${assessor.email}) gets in-app notifications only.               │
  │                                                                                          │
  │  Re-run the seeder at any time to reset all cases back to their initial state.           │
  └──────────────────────────────────────────────────────────────────────────────────────────┘
  `);
}
