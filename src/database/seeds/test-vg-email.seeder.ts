import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  DisputeCase,
  DisputeStatus,
  OutcomeResult,
} from '../../api/dispute-cases/entities/dispute-case.entity';
import { ClientStatus } from '../../api/clients/entities/client.entity';

const logger = new Logger('VgEmailTest');

const IDS = {
  client: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  property: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  valuationNotice: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
  assessmentDoc: 'd4e5f6a7-b8c9-0123-defa-234567890123',
  caseApproved: 'e5f6a7b8-c9d0-1234-efab-345678901234',
  caseDeclined: 'f6a7b8c9-d0e1-2345-fabc-456789012345',
} as const;

const TEST_EMAIL = process.env.VG_SENDER_EMAILS;

export async function testVgEmail(dataSource: DataSource): Promise<void> {
  // ── Resolve accountant ───────────────────────────────────────────────────
  const [accountant] = await dataSource.query<
    { id: string; fullName: string }[]
  >(
    `SELECT id, full_name AS "fullName" FROM users WHERE email = 'landtaxdispute@ymlgroup.com.au' LIMIT 1`,
  );
  if (!accountant)
    throw new Error('Internal assessor not found — run npm run seed first');

  // ── Client ────────────────────────────────────────────────────────────────
  await dataSource.query(
    `
    INSERT INTO clients (id, name, email, status, assigned_accountant_id)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
  `,
    [
      IDS.client,
      'Arvin Test Client',
      TEST_EMAIL,
      ClientStatus.ACTIVE,
      accountant.id,
    ],
  );

  // ── Property ──────────────────────────────────────────────────────────────
  await dataSource.query(
    `
    INSERT INTO properties (id, client_id, address, suburb, state, postcode)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO NOTHING
  `,
    [IDS.property, IDS.client, '1 Test Street', 'Melbourne', 'VIC', '3000'],
  );

  // ── Assessment document ───────────────────────────────────────────────────
  await dataSource.query(
    `
    INSERT INTO assessment_documents (id, client_id, document_name, file_path)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (id) DO NOTHING
  `,
    [
      IDS.assessmentDoc,
      IDS.client,
      'Land Tax Assessment Notice',
      'test/vg-email-test.pdf',
    ],
  );

  // ── Valuation notice ──────────────────────────────────────────────────────
  await dataSource.query(
    `
    INSERT INTO valuation_notices
      (id, property_id, source_document_id, appraised_by_id, valuation_date,
       assessed_land_value, appraised_value, valuation_delta, decision_outcome,
       is_exempt, notice_reference, analyst_notes, appraised_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (id) DO NOTHING
  `,
    [
      IDS.valuationNotice,
      IDS.property,
      IDS.assessmentDoc,
      accountant.id,
      '2024-07-01',
      3000000,
      2500000,
      -500000,
      'ADVISORY',
      false,
      'TEST-VG-EMAIL',
      '',
      new Date(),
    ],
  );

  // ── Case: vg_agreed test — always reset to objection_submitted ──────────────
  await dataSource.query(
    `
    INSERT INTO dispute_cases
      (id, case_reference, client_id, property_id, valuation_notice_id,
       assigned_accountant_id, jurisdiction, status, statutory_deadline,
       no_legal_ground_flagged, lodgment_reference_number, submitted_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (id) DO UPDATE SET status = 'objection_submitted'
  `,
    [
      IDS.caseApproved,
      'SEED-VGEMAIL-001',
      IDS.client,
      IDS.property,
      IDS.valuationNotice,
      accountant.id,
      'VIC',
      'objection_submitted',
      '2026-12-31',
      false,
      'LR-2025-TEST-0001',
      new Date(),
    ],
  );

  // ── Case: adverse VG response test — always reset to objection_submitted ──────────────
  await dataSource.query(
    `
    INSERT INTO dispute_cases
      (id, case_reference, client_id, property_id, valuation_notice_id,
       assigned_accountant_id, jurisdiction, status, statutory_deadline,
       no_legal_ground_flagged, lodgment_reference_number, submitted_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (id) DO UPDATE SET status = 'objection_submitted'
    
  `,
    [
      IDS.caseDeclined,
      'SEED-VGEMAIL-002',
      IDS.client,
      IDS.property,
      IDS.valuationNotice,
      accountant.id,
      'VIC',
      'objection_submitted',
      '2026-12-31',
      false,
      'LR-2025-TEST-0002',
      new Date(),
    ],
  );

  logger.log('Test data ready — triggering subscriber via save()...');

  // ── Trigger subscriber: vg_agreed ───────────────────────────────────────
  const approvedCase = await dataSource.manager.findOne(DisputeCase, {
    where: { id: IDS.caseApproved },
  });
  if (!approvedCase) throw new Error(`Case ${IDS.caseApproved} not found`);
  approvedCase.status = DisputeStatus.VG_AGREED;
  await dataSource.manager.save(DisputeCase, approvedCase);
  logger.log(`vg_agreed — subscriber fired for case SEED-VGEMAIL-001`);

  // ── Trigger subscriber: an adverse VG response ────────────────────────────
  // There is no longer a "declined" status: an unfavourable reply is recorded as
  // VG_RESPONSE_RECEIVED with outcome = rejected, and a human then decides whether to make a
  // further submission or close the case.
  const declinedCase = await dataSource.manager.findOne(DisputeCase, {
    where: { id: IDS.caseDeclined },
  });
  if (!declinedCase) throw new Error(`Case ${IDS.caseDeclined} not found`);
  declinedCase.status = DisputeStatus.VG_RESPONSE_RECEIVED;
  declinedCase.outcome = OutcomeResult.REJECTED;
  // What the response said now lives on the audit row for the transition, not on the case —
  // vg_response_notes was dropped by 1786000000000. This seeder sets the status directly rather
  // than going through the transition service, so there is no audit row to attach it to.
  await dataSource.manager.save(DisputeCase, declinedCase);
  logger.log(
    `adverse VG response — subscriber fired for case SEED-VGEMAIL-002`,
  );
}
