import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../../app.module';
import { DisputeCase, DisputeStatus } from '../../api/dispute-cases/entities/dispute-case.entity';
import { ClientStatus } from '../../api/clients/entities/client.entity';

const logger = new Logger('VgEmailTest');

const IDS = {
  client:          'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  property:        'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  valuationNotice: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
  assessmentDoc:   'd4e5f6a7-b8c9-0123-defa-234567890123',
  caseApproved:    'e5f6a7b8-c9d0-1234-efab-345678901234',
  caseDeclined:    'f6a7b8c9-d0e1-2345-fabc-456789012345',
} as const;

const TEST_EMAIL = 'arvin.bermudez@ymlgroup.com.au';

async function main() {
  const app        = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  // ── Resolve accountant ───────────────────────────────────────────────────
  const [accountant] = await dataSource.query(
    `SELECT id, full_name AS "fullName" FROM users WHERE email = 'landtaxdispute@ymlgroup.com.au' LIMIT 1`,
  );
  if (!accountant) throw new Error('Internal assessor not found — run npm run seed first');

  // ── Client ────────────────────────────────────────────────────────────────
  await dataSource.query(`
    INSERT INTO clients (id, name, email, status, assigned_accountant_id)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
  `, [IDS.client, 'Arvin Test Client', TEST_EMAIL, ClientStatus.ACTIVE, accountant.id]);

  // ── Property ──────────────────────────────────────────────────────────────
  await dataSource.query(`
    INSERT INTO properties (id, client_id, address, suburb, state, postcode)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO NOTHING
  `, [IDS.property, IDS.client, '1 Test Street', 'Melbourne', 'VIC', '3000']);

  // ── Assessment document ───────────────────────────────────────────────────
  await dataSource.query(`
    INSERT INTO assessment_documents (id, client_id, file_path, notice_date, valuation_year)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (id) DO NOTHING
  `, [IDS.assessmentDoc, IDS.client, 'test/vg-email-test.pdf', '2025-01-01', '2025']);

  // ── Valuation notice ──────────────────────────────────────────────────────
  await dataSource.query(`
    INSERT INTO valuation_notices
      (id, property_id, source_document_id, appraised_by_id, valuation_date,
       assessed_land_value, appraised_value, valuation_delta, decision_outcome,
       is_exempt, notice_reference, analyst_notes, appraised_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (id) DO NOTHING
  `, [IDS.valuationNotice, IDS.property, IDS.assessmentDoc, accountant.id,
      '2024-07-01', 3000000, 2500000, -500000, 'ADVISORY', false,
      'TEST-VG-EMAIL', '', new Date()]);

  // ── Case: vg_approved test — always reset to submitted_to_vg ──────────────
  await dataSource.query(`
    INSERT INTO dispute_cases
      (id, case_reference, client_id, property_id, valuation_notice_id,
       assigned_accountant_id, jurisdiction, status, statutory_deadline,
       no_legal_ground_flagged, lodgment_reference_number, submitted_at, client_approved_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (id) DO UPDATE SET status = 'submitted_to_vg'
  `, [IDS.caseApproved, 'SEED-VGEMAIL-001', IDS.client, IDS.property,
      IDS.valuationNotice, accountant.id, 'VIC', 'submitted_to_vg',
      '2026-12-31', false, 'LR-2025-TEST-0001', new Date(), new Date()]);

  // ── Case: vg_declined test — always reset to submitted_to_vg ──────────────
  await dataSource.query(`
    INSERT INTO dispute_cases
      (id, case_reference, client_id, property_id, valuation_notice_id,
       assigned_accountant_id, jurisdiction, status, statutory_deadline,
       no_legal_ground_flagged, lodgment_reference_number, submitted_at, client_approved_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (id) DO UPDATE SET status = 'submitted_to_vg'
  `, [IDS.caseDeclined, 'SEED-VGEMAIL-002', IDS.client, IDS.property,
      IDS.valuationNotice, accountant.id, 'VIC', 'submitted_to_vg',
      '2026-12-31', false, 'LR-2025-TEST-0002', new Date(), new Date()]);

  logger.log('Test data ready — triggering subscriber via save()...');

  // ── Trigger subscriber: vg_approved ───────────────────────────────────────
  const approvedCase = await dataSource.manager.findOne(DisputeCase, {
    where: { id: IDS.caseApproved },
  });
  if (!approvedCase) throw new Error(`Case ${IDS.caseApproved} not found`);
  approvedCase.status = DisputeStatus.VG_APPROVED;
  await dataSource.manager.save(DisputeCase, approvedCase);
  logger.log(`vg_approved — subscriber fired for case SEED-VGEMAIL-001`);

  // ── Trigger subscriber: vg_declined ───────────────────────────────────────
  const declinedCase = await dataSource.manager.findOne(DisputeCase, {
    where: { id: IDS.caseDeclined },
  });
  if (!declinedCase) throw new Error(`Case ${IDS.caseDeclined} not found`);
  declinedCase.status = DisputeStatus.VG_DECLINED;
  declinedCase.vg_response_notes = 'VG upheld original valuation.';
  await dataSource.manager.save(DisputeCase, declinedCase);
  logger.log(`vg_declined — subscriber fired for case SEED-VGEMAIL-002`);

  await app.close();
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
