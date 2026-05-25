import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from 'src/api/users/entities/user.entity';
import { Client, ClientStatus } from 'src/api/clients/entities/client.entity';

const logger = new Logger('SubmitToVGSeeder');

// ─── IDs — pol.imbing set ─────────────────────────────────────────────────────
const IDS = {
  client:             'e3a7f2c1-8b4d-4f9a-b2e6-d5c9a1f3e8b7',
  property:           '7d4c9e2a-f1b8-4a3d-9c6e-b2f7a5d1e4c8',
  assessmentDocument: 'a9b3d7f4-2c6e-4b8a-8d5f-e7c2a9b4d6f3',
  valuationNotice:    'f1e8a3c6-9b2d-4f7a-b5e1-d3c8f6a2e9b4',

  // CLIENT_APPROVED — call POST /v1/dispute-cases/{id}/submit-to-vg to test happy path
  caseReady:          'c4b8f2a7-e1d9-4c3b-a6f5-b2e7d4c1f8a3',

  // SUBMITTED_TO_VG — already submitted, triggers the 409 guard
  caseAlreadyDone:    'd7a3e9b1-f4c2-4d8a-b1e6-c5f9a2d7b4e3',
} as const;

// ─── IDs — april.clemente set ─────────────────────────────────────────────────
const APRIL_IDS = {
  client:             'b1c4d7e2-3f8a-4b9c-d6e5-f2a1b3c8d4e7',
  property:           '8e5f1b4c-2d7a-4e9b-c3f6-a1d8e5f2b4c9',
  assessmentDocument: 'c2d6e9f3-4b1a-4c7d-e8f5-b3c9a2d6e1f4',
  valuationNotice:    'a5b8c2d9-6f3e-4a1b-f7c4-d2e8a5b9c3f6',

  // CLIENT_APPROVED — call POST /v1/dispute-cases/{id}/submit-to-vg to test happy path
  caseReady:          'e9f2a5b8-c3d6-4e1a-b7f4-c5d9e2f6a3b8',

  // SUBMITTED_TO_VG — already submitted, triggers the 409 guard
  caseAlreadyDone:    'f3a6b9c2-d5e8-4f1b-c4a7-d8f3a6b2c9e5',
} as const;

export async function seedSubmitToVG(dataSource: DataSource): Promise<void> {
  const userRepo   = dataSource.getRepository(User);
  const clientRepo = dataSource.getRepository(Client);

  // ── 1. Resolve accountant ──────────────────────────────────────────────────
  const accountant = await userRepo.findOneBy({ email: 'pol.imbing@ymlgroup.com.au' });
  if (!accountant) {
    throw new Error('[SubmitToVGSeeder] pol.imbing not found — run seedUsers() first.');
  }
  logger.log(`Resolved accountant: ${accountant.fullName} (${accountant.id})`);

  // ── 2. Client (Pattern A — TypeORM repo) ──────────────────────────────────
  let client = await clientRepo.findOneBy({ id: IDS.client });
  if (!client) {
    client = await clientRepo.save(
      clientRepo.create({
        id:     IDS.client,
        name:   'Helena Mercer',
        email:  'pol.imbing@ymlgroup.com.au',
        status: ClientStatus.ACTIVE,
        assigned_accountant_id: accountant.id,
      }),
    );
    logger.log('Seeded client: Helena Mercer');
  } else {
    logger.log('Skipped client (already exists): Helena Mercer');
  }

  // ── 3. Property (Pattern B — raw SQL) ─────────────────────────────────────
  const [existingProperty] = await dataSource.query(
    `SELECT id FROM properties WHERE id = $1`, [IDS.property],
  );
  if (!existingProperty) {
    await dataSource.query(`
      INSERT INTO properties
        (id, client_id, address, suburb, state, postcode, pid, ownership_pct, land_area_sqm, zoning)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [IDS.property, IDS.client, '77 Pitt Street', 'Sydney', 'NSW', '2000', '3007700', 100.00, null, null]);
    logger.log('Seeded property: 77 Pitt Street, Sydney');
  } else {
    logger.log('Skipped property (already exists): 77 Pitt Street');
  }

  // ── 4. Assessment Document (Pattern B — raw SQL) ──────────────────────────
  const [existingDoc] = await dataSource.query(
    `SELECT id FROM assessment_documents WHERE id = $1`, [IDS.assessmentDocument],
  );
  if (!existingDoc) {
    await dataSource.query(`
      INSERT INTO assessment_documents
        (id, client_id, file_path, document_name)
      VALUES ($1, $2, $3, $4)
    `, [
      IDS.assessmentDocument,
      IDS.client,
      `dispute-cases/${IDS.assessmentDocument}/valuation-notice.pdf`,
      'Valuation Notice 2025',
    ]);
    logger.log('Seeded assessment document');
  } else {
    logger.log('Skipped assessment document (already exists)');
  }

  // ── 5. Valuation Notice (Pattern B — raw SQL) ─────────────────────────────
  const [existingNotice] = await dataSource.query(
    `SELECT id FROM valuation_notices WHERE id = $1`, [IDS.valuationNotice],
  );
  if (!existingNotice) {
    const assessed  = 3_100_000;
    const appraised = 2_500_000;
    await dataSource.query(`
      INSERT INTO valuation_notices
        (id, property_id, source_document_id, appraised_by_id, valuation_date,
         assessed_land_value, appraised_value, valuation_delta, decision_outcome,
         is_exempt, notice_reference, analyst_notes, appraised_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      IDS.valuationNotice,
      IDS.property,
      IDS.assessmentDocument,
      accountant.id,
      '2024-07-01',
      assessed,
      appraised,
      +(appraised - assessed).toFixed(2),
      'ADVISORY',
      false,
      `SEED-REF-${IDS.property.slice(0, 8).toUpperCase()}`,
      '',
      new Date().toISOString(),
    ]);
    logger.log('Seeded valuation notice');
  } else {
    logger.log('Skipped valuation notice (already exists)');
  }

  // ── 6a. Case: CLIENT_APPROVED — happy path (Pattern B — raw SQL for timestamps) ──
  const [existingReady] = await dataSource.query(
    `SELECT id, status FROM dispute_cases WHERE id = $1`, [IDS.caseReady],
  );
  if (!existingReady) {
    await dataSource.query(`
      INSERT INTO dispute_cases
        (id, case_reference, client_id, property_id, valuation_notice_id,
         assigned_accountant_id, jurisdiction, status, statutory_deadline,
         no_legal_ground_flagged, client_approved_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      IDS.caseReady, 'SEED-VG-001', IDS.client, IDS.property, IDS.valuationNotice,
      accountant.id, 'NSW', 'client_approved', '2026-12-31', false, new Date(),
    ]);
    logger.log(`Seeded dispute case: SEED-VG-001  [status: client_approved]`);
  } else if (existingReady.status !== 'client_approved') {
    // Reset so the happy path can be re-tested
    await dataSource.query(`
      UPDATE dispute_cases
      SET status = 'client_approved',
          client_approved_at = $1,
          submitted_at = NULL,
          lodgment_reference_number = NULL
      WHERE id = $2
    `, [new Date(), IDS.caseReady]);
    logger.log('Reset SEED-VG-001 back to client_approved');
  } else {
    logger.log('Skipped dispute case (already exists): SEED-VG-001');
  }

  // ── 6b. Case: SUBMITTED_TO_VG — 409 guard (Pattern B — raw SQL) ───────────
  const [existingDone] = await dataSource.query(
    `SELECT id FROM dispute_cases WHERE id = $1`, [IDS.caseAlreadyDone],
  );
  if (!existingDone) {
    await dataSource.query(`
      INSERT INTO dispute_cases
        (id, case_reference, client_id, property_id, valuation_notice_id,
         assigned_accountant_id, jurisdiction, status, statutory_deadline,
         no_legal_ground_flagged, client_approved_at, submitted_at,
         lodgment_reference_number)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      IDS.caseAlreadyDone, 'SEED-VG-002', IDS.client, IDS.property, IDS.valuationNotice,
      accountant.id, 'NSW', 'submitted_to_vg', '2026-12-31', false,
      new Date(), new Date(), 'LR-2025-D7A3-0000',
    ]);
    logger.log(`Seeded dispute case: SEED-VG-002  [status: submitted_to_vg]`);
  } else {
    logger.log('Skipped dispute case (already exists): SEED-VG-002');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // april.clemente set
  // ════════════════════════════════════════════════════════════════════════════

  // ── A1. Resolve accountant ─────────────────────────────────────────────────
  const aprilAccountant = await userRepo.findOneBy({ email: 'april.clemente@ymlgroup.com.au' });
  if (!aprilAccountant) {
    throw new Error('[SubmitToVGSeeder] april.clemente not found — run seedUsers() first.');
  }
  logger.log(`Resolved accountant: ${aprilAccountant.fullName} (${aprilAccountant.id})`);

  // ── A2. Client ─────────────────────────────────────────────────────────────
  let aprilClient = await clientRepo.findOneBy({ id: APRIL_IDS.client });
  if (!aprilClient) {
    aprilClient = await clientRepo.save(
      clientRepo.create({
        id:                     APRIL_IDS.client,
        name:                   'Marcus Delgado',
        email:                  'april.clemente@ymlgroup.com.au',
        status:                 ClientStatus.ACTIVE,
        assigned_accountant_id: aprilAccountant.id,
      }),
    );
    logger.log('Seeded client: Marcus Delgado');
  } else {
    logger.log('Skipped client (already exists): Marcus Delgado');
  }

  // ── A3. Property ───────────────────────────────────────────────────────────
  const [existingAprilProperty] = await dataSource.query(
    `SELECT id FROM properties WHERE id = $1`, [APRIL_IDS.property],
  );
  if (!existingAprilProperty) {
    await dataSource.query(`
      INSERT INTO properties
        (id, client_id, address, suburb, state, postcode, pid, ownership_pct, land_area_sqm, zoning)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [APRIL_IDS.property, APRIL_IDS.client, '14 Collins Street', 'Melbourne', 'VIC', '3000', '4001400', 100.00, null, null]);
    logger.log('Seeded property: 14 Collins Street, Melbourne');
  } else {
    logger.log('Skipped property (already exists): 14 Collins Street');
  }

  // ── A4. Assessment Document ────────────────────────────────────────────────
  const [existingAprilDoc] = await dataSource.query(
    `SELECT id FROM assessment_documents WHERE id = $1`, [APRIL_IDS.assessmentDocument],
  );
  if (!existingAprilDoc) {
    await dataSource.query(`
      INSERT INTO assessment_documents
        (id, client_id, file_path, document_name)
      VALUES ($1, $2, $3, $4)
    `, [
      APRIL_IDS.assessmentDocument,
      APRIL_IDS.client,
      `dispute-cases/${APRIL_IDS.assessmentDocument}/valuation-notice.pdf`,
      'Valuation Notice 2025',
    ]);
    logger.log('Seeded assessment document (april set)');
  } else {
    logger.log('Skipped assessment document (already exists, april set)');
  }

  // ── A5. Valuation Notice ───────────────────────────────────────────────────
  const [existingAprilNotice] = await dataSource.query(
    `SELECT id FROM valuation_notices WHERE id = $1`, [APRIL_IDS.valuationNotice],
  );
  if (!existingAprilNotice) {
    const assessed  = 4_200_000;
    const appraised = 3_400_000;
    await dataSource.query(`
      INSERT INTO valuation_notices
        (id, property_id, source_document_id, appraised_by_id, valuation_date,
         assessed_land_value, appraised_value, valuation_delta, decision_outcome,
         is_exempt, notice_reference, analyst_notes, appraised_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      APRIL_IDS.valuationNotice,
      APRIL_IDS.property,
      APRIL_IDS.assessmentDocument,
      aprilAccountant.id,
      '2024-07-01',
      assessed,
      appraised,
      +(appraised - assessed).toFixed(2),
      'ADVISORY',
      false,
      `SEED-REF-${APRIL_IDS.property.slice(0, 8).toUpperCase()}`,
      '',
      new Date().toISOString(),
    ]);
    logger.log('Seeded valuation notice (april set)');
  } else {
    logger.log('Skipped valuation notice (already exists, april set)');
  }

  // ── A6a. Case: CLIENT_APPROVED ─────────────────────────────────────────────
  const [existingAprilReady] = await dataSource.query(
    `SELECT id, status FROM dispute_cases WHERE id = $1`, [APRIL_IDS.caseReady],
  );
  if (!existingAprilReady) {
    await dataSource.query(`
      INSERT INTO dispute_cases
        (id, case_reference, client_id, property_id, valuation_notice_id,
         assigned_accountant_id, jurisdiction, status, statutory_deadline,
         no_legal_ground_flagged, client_approved_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      APRIL_IDS.caseReady, 'SEED-VG-003', APRIL_IDS.client, APRIL_IDS.property, APRIL_IDS.valuationNotice,
      aprilAccountant.id, 'VIC', 'client_approved', '2026-12-31', false, new Date(),
    ]);
    logger.log('Seeded dispute case: SEED-VG-003  [status: client_approved]');
  } else if (existingAprilReady.status !== 'client_approved') {
    await dataSource.query(`
      UPDATE dispute_cases
      SET status = 'client_approved',
          client_approved_at = $1,
          submitted_at = NULL,
          lodgment_reference_number = NULL
      WHERE id = $2
    `, [new Date(), APRIL_IDS.caseReady]);
    logger.log('Reset SEED-VG-003 back to client_approved');
  } else {
    logger.log('Skipped dispute case (already exists): SEED-VG-003');
  }

  // ── A6b. Case: SUBMITTED_TO_VG ─────────────────────────────────────────────
  const [existingAprilDone] = await dataSource.query(
    `SELECT id FROM dispute_cases WHERE id = $1`, [APRIL_IDS.caseAlreadyDone],
  );
  if (!existingAprilDone) {
    await dataSource.query(`
      INSERT INTO dispute_cases
        (id, case_reference, client_id, property_id, valuation_notice_id,
         assigned_accountant_id, jurisdiction, status, statutory_deadline,
         no_legal_ground_flagged, client_approved_at, submitted_at,
         lodgment_reference_number)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      APRIL_IDS.caseAlreadyDone, 'SEED-VG-004', APRIL_IDS.client, APRIL_IDS.property, APRIL_IDS.valuationNotice,
      aprilAccountant.id, 'VIC', 'submitted_to_vg', '2026-12-31', false,
      new Date(), new Date(), 'LR-2025-F3A6-0000',
    ]);
    logger.log('Seeded dispute case: SEED-VG-004  [status: submitted_to_vg]');
  } else {
    logger.log('Skipped dispute case (already exists): SEED-VG-004');
  }

  logger.log(`
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │  Submit-to-VG seeder complete                                                │
  │                                                                              │
  │  Login as Internal Assessor:                                                 │
  │    POST /v1/auth/login                                                       │
  │    { "email": "landtaxdispute@ymlgroup.com.au", "password": "Admin@123" }   │
  │                                                                              │
  │  pol.imbing set:                                                             │
  │    Happy path → POST /v1/dispute-cases/${IDS.caseReady}/submit-to-vg    │
  │    409 guard  → POST /v1/dispute-cases/${IDS.caseAlreadyDone}/submit-to-vg    │
  │                                                                              │
  │  april.clemente set:                                                         │
  │    Happy path → POST /v1/dispute-cases/${APRIL_IDS.caseReady}/submit-to-vg    │
  │    409 guard  → POST /v1/dispute-cases/${APRIL_IDS.caseAlreadyDone}/submit-to-vg    │
  │                                                                              │
  │  403 guard → use any case not in client_approved status                     │
  └──────────────────────────────────────────────────────────────────────────────┘
  `);
}
