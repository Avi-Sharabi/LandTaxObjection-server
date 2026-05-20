import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from 'src/api/users/entities/user.entity';

// Lodgment reference must match the subject line of the test email:
//   "Re: Land Tax Objection — VG-DC-2025-001-1746000000"
export const VG_TEST_LODGMENT_REF = 'VG-DC-2025-001-1746000000';

const ARVIN_EMAIL = 'arvin.bermudez@ymlgroup.com.au';

interface TestCase {
  pid: string | null;
  address: string;
  suburb: string;
  postcode: string;
  caseRef: string;
  status: 'submitted_to_vg' | 'for_review';
  lodgmentRef: string | null;
  expectedOutcome: string | null;
  client: string;
  property: string;
  assessmentDoc: string;
  valuationNotice: string;
  disputeCase: string;
}

const ALL_CASES: TestCase[] = [
  // ── Lodgment-ref case ──────────────────────────────────────────────────────
  {
    pid: '9990001', address: '1 VG TEST ST SOUTH YARRA', suburb: 'South Yarra', postcode: '3141',
    caseRef: 'LTD-2026-VG-TEST-001', status: 'submitted_to_vg',
    lodgmentRef: VG_TEST_LODGMENT_REF, expectedOutcome: null,
    client: 'f1234560-0001-4001-b001-000000000001', property: 'f1234560-0001-4001-b001-000000000002',
    assessmentDoc: 'f1234560-0001-4001-b001-000000000003', valuationNotice: 'f1234560-0001-4001-b001-000000000004',
    disputeCase: 'f1234560-0001-4001-b001-000000000005',
  },

  // ── Simple PID cases ───────────────────────────────────────────────────────
  {
    pid: '2000002', address: '2 PID TEST ST SOUTH YARRA', suburb: 'South Yarra', postcode: '3141',
    caseRef: 'LTD-2026-VG-PID-2000002', status: 'submitted_to_vg',
    lodgmentRef: null, expectedOutcome: 'approved',
    client: 'f1234560-0002-4001-b001-000000000001', property: 'f1234560-0002-4001-b001-000000000002',
    assessmentDoc: 'f1234560-0002-4001-b001-000000000003', valuationNotice: 'f1234560-0002-4001-b001-000000000004',
    disputeCase: 'f1234560-0002-4001-b001-000000000005',
  },
  {
    pid: '1000002', address: '1 PID TEST ST SOUTH YARRA', suburb: 'South Yarra', postcode: '3141',
    caseRef: 'LTD-2026-VG-PID-1000002', status: 'submitted_to_vg',
    lodgmentRef: null, expectedOutcome: 'declined',
    client: 'f1234560-0003-4001-b001-000000000001', property: 'f1234560-0003-4001-b001-000000000002',
    assessmentDoc: 'f1234560-0003-4001-b001-000000000003', valuationNotice: 'f1234560-0003-4001-b001-000000000004',
    disputeCase: 'f1234560-0003-4001-b001-000000000005',
  },

  // ── Mixed bulk PID cases (Scenarios A–F) ──────────────────────────────────
  {
    pid: '5000001', address: '5 MIXED TEST ST SOUTH YARRA', suburb: 'South Yarra', postcode: '3141',
    caseRef: 'LTD-2026-VG-MIX-001', status: 'submitted_to_vg',
    lodgmentRef: null, expectedOutcome: 'approved',
    client: 'f1234560-0011-4001-b001-000000000001', property: 'f1234560-0011-4001-b001-000000000002',
    assessmentDoc: 'f1234560-0011-4001-b001-000000000003', valuationNotice: 'f1234560-0011-4001-b001-000000000004',
    disputeCase: 'f1234560-0011-4001-b001-000000000005',
  },
  {
    pid: '5000002', address: '6 MIXED TEST ST SOUTH YARRA', suburb: 'South Yarra', postcode: '3141',
    caseRef: 'LTD-2026-VG-MIX-002', status: 'submitted_to_vg',
    lodgmentRef: null, expectedOutcome: 'declined',
    client: 'f1234560-0012-4001-b001-000000000001', property: 'f1234560-0012-4001-b001-000000000002',
    assessmentDoc: 'f1234560-0012-4001-b001-000000000003', valuationNotice: 'f1234560-0012-4001-b001-000000000004',
    disputeCase: 'f1234560-0012-4001-b001-000000000005',
  },
  {
    pid: '5000003', address: '7 MIXED TEST ST SOUTH YARRA', suburb: 'South Yarra', postcode: '3141',
    caseRef: 'LTD-2026-VG-MIX-003', status: 'submitted_to_vg',
    lodgmentRef: null, expectedOutcome: 'approved',
    client: 'f1234560-0013-4001-b001-000000000001', property: 'f1234560-0013-4001-b001-000000000002',
    assessmentDoc: 'f1234560-0013-4001-b001-000000000003', valuationNotice: 'f1234560-0013-4001-b001-000000000004',
    disputeCase: 'f1234560-0013-4001-b001-000000000005',
  },
  {
    pid: '5000004', address: '8 MIXED TEST ST SOUTH YARRA', suburb: 'South Yarra', postcode: '3141',
    caseRef: 'LTD-2026-VG-MIX-004', status: 'submitted_to_vg',
    lodgmentRef: null, expectedOutcome: 'declined',
    client: 'f1234560-0014-4001-b001-000000000001', property: 'f1234560-0014-4001-b001-000000000002',
    assessmentDoc: 'f1234560-0014-4001-b001-000000000003', valuationNotice: 'f1234560-0014-4001-b001-000000000004',
    disputeCase: 'f1234560-0014-4001-b001-000000000005',
  },
  {
    pid: '5000005', address: '9 MIXED TEST ST SOUTH YARRA', suburb: 'South Yarra', postcode: '3141',
    caseRef: 'LTD-2026-VG-MIX-005', status: 'submitted_to_vg',
    lodgmentRef: null, expectedOutcome: 'approved',
    client: 'f1234560-0015-4001-b001-000000000001', property: 'f1234560-0015-4001-b001-000000000002',
    assessmentDoc: 'f1234560-0015-4001-b001-000000000003', valuationNotice: 'f1234560-0015-4001-b001-000000000004',
    disputeCase: 'f1234560-0015-4001-b001-000000000005',
  },
  {
    pid: '5000006', address: '10 MIXED TEST ST SOUTH YARRA', suburb: 'South Yarra', postcode: '3141',
    caseRef: 'LTD-2026-VG-MIX-006', status: 'submitted_to_vg',
    lodgmentRef: null, expectedOutcome: 'declined',
    client: 'f1234560-0016-4001-b001-000000000001', property: 'f1234560-0016-4001-b001-000000000002',
    assessmentDoc: 'f1234560-0016-4001-b001-000000000003', valuationNotice: 'f1234560-0016-4001-b001-000000000004',
    disputeCase: 'f1234560-0016-4001-b001-000000000005',
  },

  // ── Address-only cases (no PID — matched via ILIKE) ────────────────────────
  {
    pid: null, address: '11 ADDRESS ONLY TERRACE SOUTH YARRA', suburb: 'South Yarra', postcode: '3141',
    caseRef: 'LTD-2026-VG-ADDR-001', status: 'submitted_to_vg',
    lodgmentRef: null, expectedOutcome: 'approved',
    client: 'f1234560-0017-4001-b001-000000000001', property: 'f1234560-0017-4001-b001-000000000002',
    assessmentDoc: 'f1234560-0017-4001-b001-000000000003', valuationNotice: 'f1234560-0017-4001-b001-000000000004',
    disputeCase: 'f1234560-0017-4001-b001-000000000005',
  },
  {
    pid: null, address: '12 ADDRESS ONLY BOULEVARD SOUTH YARRA', suburb: 'South Yarra', postcode: '3141',
    caseRef: 'LTD-2026-VG-ADDR-002', status: 'submitted_to_vg',
    lodgmentRef: null, expectedOutcome: 'declined',
    client: 'f1234560-0018-4001-b001-000000000001', property: 'f1234560-0018-4001-b001-000000000002',
    assessmentDoc: 'f1234560-0018-4001-b001-000000000003', valuationNotice: 'f1234560-0018-4001-b001-000000000004',
    disputeCase: 'f1234560-0018-4001-b001-000000000005',
  },
];

const logger = new Logger('VgMonitorTestSeeder');

async function seedCase(dataSource: DataSource, c: TestCase, accountantId: string): Promise<void> {
  const [existingClient] = await dataSource.query(`SELECT id FROM clients WHERE id = $1`, [c.client]);
  if (!existingClient) {
    await dataSource.query(
      `INSERT INTO clients (id, name, email, status, assigned_accountant_id) VALUES ($1, $2, $3, $4, $5)`,
      [c.client, `VG Test Client — ${c.pid ? `PID ${c.pid}` : c.address}`, ARVIN_EMAIL, 'active', accountantId],
    );
  }

  const [existingProp] = await dataSource.query(`SELECT id FROM properties WHERE id = $1`, [c.property]);
  if (!existingProp) {
    await dataSource.query(
      `INSERT INTO properties (id, client_id, address, suburb, state, postcode, pid, ownership_pct, land_area_sqm, zoning)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [c.property, c.client, c.address, c.suburb, 'VIC', c.postcode, c.pid, 100.00, null, null],
    );
  }

  const [existingDoc] = await dataSource.query(`SELECT id FROM assessment_documents WHERE id = $1`, [c.assessmentDoc]);
  if (!existingDoc) {
    await dataSource.query(
      `INSERT INTO assessment_documents (id, client_id, file_path, notice_date, valuation_year) VALUES ($1, $2, $3, $4, $5)`,
      [c.assessmentDoc, c.client, `dispute-cases/${c.assessmentDoc}/valuation-notice.pdf`, '2025-01-20', '2025'],
    );
  }

  const [existingNotice] = await dataSource.query(`SELECT id FROM valuation_notices WHERE id = $1`, [c.valuationNotice]);
  if (!existingNotice) {
    await dataSource.query(
      `INSERT INTO valuation_notices
         (id, property_id, source_document_id, appraised_by_id, valuation_date,
          assessed_land_value, appraised_value, valuation_delta, decision_outcome,
          is_exempt, notice_reference, analyst_notes, appraised_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        c.valuationNotice, c.property, c.assessmentDoc, accountantId,
        '2024-07-01', 950000.00, 1000000.00, 50000.00,
        'ADVISORY', false, `INTAKE-2025-${c.pid ?? c.caseRef}`, '', new Date().toISOString(),
      ],
    );
  }

  const [existingCase] = await dataSource.query(`SELECT id FROM dispute_cases WHERE id = $1`, [c.disputeCase]);
  if (!existingCase) {
    await dataSource.query(
      `INSERT INTO dispute_cases
         (id, case_reference, client_id, property_id, valuation_notice_id,
          assigned_accountant_id, jurisdiction, status, lodgment_reference_number,
          statutory_deadline, no_legal_ground_flagged, original_assessed_value, submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        c.disputeCase, c.caseRef, c.client, c.property, c.valuationNotice,
        accountantId, 'VIC', c.status, c.lodgmentRef,
        '2026-06-30', false, 950000.00, new Date().toISOString(),
      ],
    );
    const identifier = c.pid ? `PID ${c.pid}` : `"${c.address}"`;
    logger.log(`  Seeded ${c.caseRef} — ${identifier} — status=${c.status}`);
  } else {
    await dataSource.query(
      `UPDATE dispute_cases
       SET status = $1, vg_response_notes = NULL
       WHERE id = $2`,
      [c.status, c.disputeCase],
    );
    logger.log(`  Reset ${c.caseRef} → ${c.status}`);
  }
}

export async function seedVgMonitorTest(dataSource: DataSource): Promise<void> {
  const arvin = await dataSource.getRepository(User).findOneBy({ email: ARVIN_EMAIL });
  if (!arvin) throw new Error(`[VgMonitorTestSeeder] "${ARVIN_EMAIL}" not found — run seedUsers() first.`);
  logger.log(`Resolved accountant: ${arvin.fullName} (${arvin.id})`);

  for (const c of ALL_CASES) {
    await seedCase(dataSource, c, arvin.id);
  }

  const pidCases  = ALL_CASES.filter(c => c.pid !== null && c.expectedOutcome !== null);
  const addrCases = ALL_CASES.filter(c => c.pid === null);
  const approved  = pidCases.filter(c => c.expectedOutcome === 'approved');
  const declined  = pidCases.filter(c => c.expectedOutcome === 'declined');
  const lodgmentCase = ALL_CASES[0];

  logger.log('');
  logger.log('── VG Monitor Test — Lodgment-ref scenario ───────────────────────');
  logger.log(`  Lodge Ref:  ${VG_TEST_LODGMENT_REF}`);
  logger.log(`  Case Ref:   ${lodgmentCase.caseRef}  (${lodgmentCase.disputeCase})`);
  logger.log(`  Subject:    Re: Land Tax Objection — ${VG_TEST_LODGMENT_REF}`);
  logger.log('');
  logger.log('── Scenario A — single approved PID ─────────────────────────────');
  logger.log(`  Subject: VG Decision — PID ${approved[0].pid}`);
  logger.log(`  Body:    We confirm the objection for PID-${approved[0].pid} has been approved.`);
  logger.log(`  Expect:  outcome=approved  case=${approved[0].disputeCase}`);
  logger.log('');
  logger.log('── Scenario B — single declined PID ─────────────────────────────');
  logger.log(`  Subject: VG Decision — PID ${declined[0].pid}`);
  logger.log(`  Body:    We advise that the objection for PID-${declined[0].pid} has been declined.`);
  logger.log(`  Expect:  outcome=declined  case=${declined[0].disputeCase}`);
  logger.log('');
  logger.log('── Scenario C — address only, approved ───────────────────────────');
  logger.log(`  Subject: VG Decision — ${addrCases[0].address}`);
  logger.log(`  Body:    We confirm the objection for the property at ${addrCases[0].address} has been approved.`);
  logger.log(`  Expect:  outcome=approved  case=${addrCases[0].disputeCase}`);
  logger.log('');
  logger.log('── Scenario D — address only, declined ───────────────────────────');
  logger.log(`  Subject: VG Decision — ${addrCases[1].address}`);
  logger.log(`  Body:    We advise that the objection for the property at ${addrCases[1].address} has been declined.`);
  logger.log(`  Expect:  outcome=declined  case=${addrCases[1].disputeCase}`);
  logger.log('');
  logger.log('── Scenario E — mixed PID + address in one email ─────────────────');
  logger.log(`  Subject: VG Bulk Decision`);
  logger.log(`  Body:    PID-${approved[0].pid} has been approved.`);
  logger.log(`           The property at ${addrCases[1].address} has been declined.`);
  logger.log(`  Expect:  2 results — approved (PID) + declined (address)`);
  logger.log('');
  logger.log('── Scenario F — all bulk PIDs mixed outcomes ─────────────────────');
  const bulkPids = pidCases.filter(c => c.caseRef.includes('MIX')).map(c => `PID-${c.pid} (${c.expectedOutcome})`).join(', ');
  logger.log(`  Body:    ${bulkPids}.`);
  logger.log(`  Expect:  ${pidCases.filter(c => c.caseRef.includes('MIX')).length} results, each resolved to its own case`);
  logger.log('');
  logger.log(`  From:    an address listed in VG_SENDER_EMAILS env var`);
  logger.log(`  To:      GRAPH_MONITORED_MAILBOX (landtaxdispute@ymlgroup.com.au)`);
  logger.log(`  Trigger: POST /api/v1/dispute-cases/dev/trigger-vg-poll`);
}
