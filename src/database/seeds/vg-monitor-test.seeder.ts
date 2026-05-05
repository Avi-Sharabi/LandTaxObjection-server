import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from 'src/api/users/entities/user.entity';

// Lodgment reference must match the subject line of the test email sent by Arvin:
//   "Re: Land Tax Objection — VG-DC-2025-001-1746000000"
export const VG_TEST_LODGMENT_REF = 'VG-DC-2025-001-1746000000';

const ARVIN_EMAIL = 'arvin.bermudez@ymlgroup.com.au';

// Fixed UUIDs so the seeder is idempotent
const IDS = {
    client:             'f1234560-0001-4001-b001-000000000001',
    property:           'f1234560-0001-4001-b001-000000000002',
    assessmentDocument: 'f1234560-0001-4001-b001-000000000003',
    valuationNotice:    'f1234560-0001-4001-b001-000000000004',
    disputeCase:        'f1234560-0001-4001-b001-000000000005',
};

const logger = new Logger('VgMonitorTestSeeder');

export async function seedVgMonitorTest(dataSource: DataSource): Promise<void> {
    const userRepo = dataSource.getRepository(User);

    const arvin = await userRepo.findOneBy({ email: ARVIN_EMAIL });
    if (!arvin) {
        throw new Error(`[VgMonitorTestSeeder] "${ARVIN_EMAIL}" not found. Run seedUsers() first.`);
    }
    logger.log(`Resolved accountant: ${arvin.fullName} (${arvin.id})`);

    // ── 1. Client ──────────────────────────────────────────────────────────────
    const [existingClient] = await dataSource.query(
        `SELECT id FROM clients WHERE id = $1`, [IDS.client],
    );
    if (!existingClient) {
        await dataSource.query(`
            INSERT INTO clients (id, name, email, status, assigned_accountant_id)
            VALUES ($1, $2, $3, $4, $5)
        `, [IDS.client, 'VG Test Client — South Yarra', ARVIN_EMAIL, 'active', arvin.id]);
        logger.log(`  Seeded client: VG Test Client — South Yarra`);
    } else {
        logger.log(`  Skipped client (exists)`);
    }

    // ── 2. Property ────────────────────────────────────────────────────────────
    const [existingProperty] = await dataSource.query(
        `SELECT id FROM properties WHERE id = $1`, [IDS.property],
    );
    if (!existingProperty) {
        await dataSource.query(`
            INSERT INTO properties
                (id, client_id, address, suburb, state, postcode, pid, ownership_pct, land_area_sqm, zoning)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [IDS.property, IDS.client, '1 VG TEST ST SOUTH YARRA', 'South Yarra', 'VIC', '3141', '9990001', 100.00, null, null]);
        logger.log(`  Seeded property: 1 VG TEST ST SOUTH YARRA`);
    } else {
        logger.log(`  Skipped property (exists)`);
    }

    // ── 3. Assessment Document ─────────────────────────────────────────────────
    const [existingDoc] = await dataSource.query(
        `SELECT id FROM assessment_documents WHERE id = $1`, [IDS.assessmentDocument],
    );
    if (!existingDoc) {
        await dataSource.query(`
            INSERT INTO assessment_documents
                (id, client_id, file_path, notice_date, valuation_year)
            VALUES ($1, $2, $3, $4, $5)
        `, [IDS.assessmentDocument, IDS.client, `dispute-cases/${IDS.assessmentDocument}/valuation-notice.pdf`, '2025-01-20', '2025']);
        logger.log(`  Seeded assessment document`);
    } else {
        logger.log(`  Skipped assessment document (exists)`);
    }

    // ── 4. Valuation Notice ────────────────────────────────────────────────────
    const [existingNotice] = await dataSource.query(
        `SELECT id FROM valuation_notices WHERE id = $1`, [IDS.valuationNotice],
    );
    if (!existingNotice) {
        await dataSource.query(`
            INSERT INTO valuation_notices
                (id, property_id, source_document_id, appraised_by_id, valuation_date,
                 assessed_land_value, appraised_value, valuation_delta, decision_outcome,
                 is_exempt, notice_reference, analyst_notes, appraised_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
            IDS.valuationNotice, IDS.property, IDS.assessmentDocument, arvin.id,
            '2024-07-01', 950000.00, 1000000.00, 50000.00,
            'ADVISORY', false, 'INTAKE-2025-9990001', '', '2026-04-06T11:39:08.126Z',
        ]);
        logger.log(`  Seeded valuation notice`);
    } else {
        logger.log(`  Skipped valuation notice (exists)`);
    }

    // ── 5. Dispute Case — status: awaiting_vg_response ────────────────────────
    const [existingCase] = await dataSource.query(
        `SELECT id FROM dispute_cases WHERE id = $1`, [IDS.disputeCase],
    );
    if (!existingCase) {
        await dataSource.query(`
            INSERT INTO dispute_cases
                (id, case_reference, client_id, property_id, valuation_notice_id,
                 assigned_accountant_id, jurisdiction, status, lodgment_reference_number,
                 statutory_deadline, no_legal_ground_flagged, original_assessed_value,
                 submitted_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
            IDS.disputeCase,
            'LTD-2026-VG-TEST-001',
            IDS.client,
            IDS.property,
            IDS.valuationNotice,
            arvin.id,
            'VIC',
            'awaiting_vg_response',
            VG_TEST_LODGMENT_REF,
            '2026-06-30',
            false,
            950000.00,
            new Date().toISOString(),
        ]);
        logger.log(`  Seeded dispute case: LTD-2026-VG-TEST-001`);
    } else {
        // Reset to testable state so the seeder can be re-run between tests
        await dataSource.query(`
            UPDATE dispute_cases
            SET status = 'awaiting_vg_response',
                vg_response_received_at = NULL,
                vg_email_message_id = NULL,
                vg_response_notes = NULL
            WHERE id = $1
        `, [IDS.disputeCase]);
        logger.log(`  Reset dispute case to awaiting_vg_response`);
    }

    logger.log('');
    logger.log('── VG Monitor Test — Use any of these in your test email ─────');
    logger.log(`  Lodge Ref:        ${VG_TEST_LODGMENT_REF}`);
    logger.log(`  Case Reference:   LTD-2026-VG-TEST-001`);
    logger.log(`  PID:              9990001`);
    logger.log(`  Property Address: 1 VG TEST ST SOUTH YARRA`);
    logger.log('');
    logger.log(`  From:    arvin.bermudez@ymlgroup.com.au`);
    logger.log(`  To:      landtaxdispute@ymlgroup.com.au`);
    logger.log(`  Trigger: POST /api/v1/dispute-cases/dev/trigger-vg-poll`);
    logger.log(`  Expected: case ${IDS.disputeCase} → status vg_response_received`);
}
