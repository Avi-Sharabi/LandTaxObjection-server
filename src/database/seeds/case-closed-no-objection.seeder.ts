import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from 'src/api/users/entities/user.entity';
import { Client, ClientStatus } from 'src/api/clients/entities/client.entity';

// Fixed UUIDs — pinned to snapshot values; seeder is idempotent
const SEED_IDS = {
    client:             'c1000000-0000-0000-0000-000000000001',
    property:           '6be33822-673b-4604-b50f-a18a2140bab9',
    assessmentDocument: 'b9f7e7ed-320d-46c7-824b-860e6cc5711a',
    valuationNotice:    'bc954230-3121-4c86-9ac1-bccb61e4672e',
    disputeCase:        'c5070af9-8669-4e49-a241-8ea087b192eb',
} as const;

const ARVIN_EMAIL = 'arvin.bermudez@ymlgroup.com.au';

const logger = new Logger('CaseClosedNoObjectionSeeder');

export async function seedCaseClosedNoObjection(dataSource: DataSource): Promise<void> {
    const userRepo   = dataSource.getRepository(User);
    const clientRepo = dataSource.getRepository(Client);

    // ── Resolve April's ID (seeded by user.seeder.ts before this runs) ─────────

    const arvin = await userRepo.findOneBy({ email: ARVIN_EMAIL });
    if (!arvin) {
        throw new Error(`[CaseClosedNoObjectionSeeder] User "${ARVIN_EMAIL}" not found. Ensure seedUsers() runs first.`);
    }
    const arvinId = arvin.id;
    logger.log(`Resolved user: ${arvin.fullName} (${arvinId})`);

    // ── 1. Client ──────────────────────────────────────────────────────────────

    const existingClient = await clientRepo.findOneBy({ id: SEED_IDS.client });
    if (!existingClient) {
        await clientRepo.save(
            clientRepo.create({
                id:                     SEED_IDS.client,
                name:                   'Test Client — Castle Hill',
                email:                  'arvin.bermudez@ymlgroup.com.au',
                status:                 ClientStatus.ACTIVE,
                assigned_accountant_id: arvinId,
            }),
        );
        logger.log('Seeded client');
    } else {
        logger.log('Skipped client (already exists)');
    }

    // ── 2. Property ────────────────────────────────────────────────────────────

    const [existingProperty] = await dataSource.query(
        `SELECT id FROM properties WHERE id = $1`,
        [SEED_IDS.property],
    );
    if (!existingProperty) {
        await dataSource.query(`
            INSERT INTO properties (id, client_id, address, suburb, state, postcode, pid, ownership_pct, land_area_sqm, zoning)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
            SEED_IDS.property,
            SEED_IDS.client,
            '1020 MELIA CT CASTLE HILL',
            '',
            'NSW',
            '',
            '3701422',
            100.00,
            null,
            null,
        ]);
        logger.log('Seeded property');
    } else {
        logger.log('Skipped property (already exists)');
    }

    // ── 3. Assessment Document ─────────────────────────────────────────────────

    const [existingDoc] = await dataSource.query(
        `SELECT id FROM assessment_documents WHERE id = $1`,
        [SEED_IDS.assessmentDocument],
    );
    if (!existingDoc) {
        await dataSource.query(`
            INSERT INTO assessment_documents (id, client_id, file_path, notice_date, valuation_year)
            VALUES ($1, $2, $3, $4, $5)
        `, [
            SEED_IDS.assessmentDocument,
            SEED_IDS.client,
            `dispute-cases/${SEED_IDS.assessmentDocument}/valuation-notice.pdf`,
            '2025-01-20',
            '2025',
        ]);
        logger.log('Seeded assessment document');
    } else {
        logger.log('Skipped assessment document (already exists)');
    }

    // ── 4. Valuation Notice ────────────────────────────────────────────────────

    const [existingNotice] = await dataSource.query(
        `SELECT id FROM valuation_notices WHERE id = $1`,
        [SEED_IDS.valuationNotice],
    );
    if (!existingNotice) {
        await dataSource.query(`
            INSERT INTO valuation_notices
                (id, property_id, source_document_id, appraised_by_id, valuation_date,
                 assessed_land_value, appraised_value, valuation_delta, decision_outcome,
                 is_exempt, notice_reference, analyst_notes, appraised_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
            SEED_IDS.valuationNotice,
            SEED_IDS.property,
            SEED_IDS.assessmentDocument,
            arvinId,
            '2024-07-01',
            703574.80,
            704000.00,
            -425.20,
            'ADVISORY',
            false,
            'INTAKE-2025-1775475351057',
            '',
            '2026-04-06T11:39:08.126Z',
        ]);
        logger.log('Seeded valuation notice');
    } else {
        logger.log('Skipped valuation notice (already exists)');
    }

    // ── 5. Dispute Case ────────────────────────────────────────────────────────

    const [existingCase] = await dataSource.query(
        `SELECT id FROM dispute_cases WHERE id = $1`,
        [SEED_IDS.disputeCase],
    );
    if (!existingCase) {
        await dataSource.query(`
            INSERT INTO dispute_cases
                (id, case_reference, client_id, property_id, valuation_notice_id,
                 assigned_accountant_id, assigned_lawyer_id, jurisdiction, status,
                 statutory_deadline, no_legal_ground_flagged, original_assessed_value,
                 analysis_report_url)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
            SEED_IDS.disputeCase,
            'LTD-2026-000030',
            SEED_IDS.client,
            SEED_IDS.property,
            SEED_IDS.valuationNotice,
            arvinId,
            null,
            'NSW',
            'advisory_letter_issued',
            '2025-03-21',
            false,
            703574.80,
            null,
        ]);
        logger.log(`Seeded dispute case: ${SEED_IDS.disputeCase}`);
    } else {
        logger.log('Skipped dispute case (already exists)');
    }

    logger.log(`\n  → Test with: GET /v1/dispute-cases/${SEED_IDS.disputeCase}`);
    logger.log(`  → Test with: GET /v1/valuation-notices/${SEED_IDS.valuationNotice}`);
}