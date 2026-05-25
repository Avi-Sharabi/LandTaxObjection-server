import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from 'src/api/users/entities/user.entity';
import { Client, ClientStatus } from 'src/api/clients/entities/client.entity';

const APRIL_EMAIL = 'april.clemente@ymlgroup.com.au';
const ARVIN_EMAIL  = 'arvin.bermudez@ymlgroup.com.au';

// ── ID pattern ────────────────────────────────────────────────────────────────
// April  → c11, c12, c13, c14, c15  (prefix 1 = April)
// Arvin  → c21, c22, c23, c24, c25  (prefix 2 = Arvin)
// Suffix → 000000000001 … 000000000005

interface CaseSeed {
    client:             string;
    property:           string;
    assessmentDocument: string;
    valuationNotice:    string;
    disputeCase:        string;
    clientName:         string;
    clientEmail:        string;
    address:            string;
    suburb:             string;
    pid:                string;
    caseReference:      string;
    assessedValue:      number;
    appraisedValue:     number;
}

const APRIL_CASES: CaseSeed[] = [
    {
        client:             '1b9a265d-6b0e-464b-988c-3256bb40497a',
        property:           'deffeaaf-9f24-4223-ae61-9f515d4ffa23',
        assessmentDocument: 'fb156d7a-93a9-4d2d-a106-bbc4ff5e81e3',
        valuationNotice:    'b96f7d89-dbe4-4508-adee-bebd8f555099',
        disputeCase:        'eca11c30-28d9-4a2f-a8a8-2918f2bbd72b',
        clientName:         'April Client 1 — Castle Hill',
        clientEmail:        APRIL_EMAIL,
        address:            '101 APRIL ST CASTLE HILL',
        suburb:             'Castle Hill',
        pid:                '1000001',
        caseReference:      'LTD-2026-APR-001',
        assessedValue:      703574.80,
        appraisedValue:     720000.00,  // fixed: was 704000.00 (too close, kept > assessed)
    },
    {
        client:             '6055bfef-bb2a-4256-97fc-4f415a9f0b94',
        property:           '2d0efea1-c869-4e62-8236-1b54664c2223',
        assessmentDocument: '9199dcbd-6c96-42be-bad0-35d7f8b0b720',
        valuationNotice:    '38343aa6-7a45-42c6-b462-a0f0a4ced29b',
        disputeCase:        '10678eb3-4d07-4fba-a1b1-2e0241632b61',
        clientName:         'April Client 2 — Baulkham Hills',
        clientEmail:        APRIL_EMAIL,
        address:            '102 APRIL ST BAULKHAM HILLS',
        suburb:             'Baulkham Hills',
        pid:                '1000002',
        caseReference:      'LTD-2026-APR-002',
        assessedValue:      850000.00,
        appraisedValue:     880000.00,  // fixed: was 820000.00
    },
    {
        client:             'd573d87a-7248-4a0c-b2d7-27612c86c864',
        property:           'e526ec27-8164-489e-89be-46bf80f8ed68',
        assessmentDocument: 'd29d2b51-396f-41fc-a7a0-a99058cc496a',
        valuationNotice:    '3fd2abbc-eb71-4332-a924-3308693fbfbb',
        disputeCase:        '7a24b6f7-6eaf-448c-afff-706a250ad8b3',
        clientName:         'April Client 3 — Kellyville',
        clientEmail:        APRIL_EMAIL,
        address:            '103 APRIL ST KELLYVILLE',
        suburb:             'Kellyville',
        pid:                '1000003',
        caseReference:      'LTD-2026-APR-003',
        assessedValue:      1200000.00,
        appraisedValue:     1250000.00, // fixed: was 1150000.00
    },
    {
        client:             '4f767a89-b9c1-42aa-bdf5-a7c178d67178',
        property:           '901c4810-dbe8-47e4-ac42-e0078ac993d4',
        assessmentDocument: '9904f09a-9b6b-48be-a564-48f94257c43c',
        valuationNotice:    'ac690e35-7373-4632-8ab8-9f96a6d59177',
        disputeCase:        '81d8b9c9-c497-4bda-96ed-c1c976488b88',
        clientName:         'April Client 4 — Norwest',
        clientEmail:        APRIL_EMAIL,
        address:            '104 APRIL ST NORWEST',
        suburb:             'Norwest',
        pid:                '1000004',
        caseReference:      'LTD-2026-APR-004',
        assessedValue:      950000.00,
        appraisedValue:     990000.00,  // fixed: was 900000.00
    },
    {
        client:             '309de2ea-a048-484b-a5f6-19e623e35211',
        property:           '53bc0379-1bd9-4101-899d-fbdbe3ca3996',
        assessmentDocument: 'd4bf7e46-66d2-4179-aec1-75a14f26bc05',
        valuationNotice:    'e4010b53-cf9f-4599-80e7-90fa36480e4e',
        disputeCase:        'cd3577b6-7494-42df-8436-29ff12bb7ce9',
        clientName:         'April Client 5 — Rouse Hill',
        clientEmail:        APRIL_EMAIL,
        address:            '105 APRIL ST ROUSE HILL',
        suburb:             'Rouse Hill',
        pid:                '1000005',
        caseReference:      'LTD-2026-APR-005',
        assessedValue:      600000.00,
        appraisedValue:     630000.00,  // fixed: was 580000.00
    },
];

const ARVIN_CASES: CaseSeed[] = [
    {
        client:             '8dbdcc97-fd92-485a-8d9b-f67762f90efd',
        property:           'd162b55e-beab-4c08-a026-d565ce9e96db',
        assessmentDocument: '2091f725-f348-4752-af37-c6527e64b53f',
        valuationNotice:    'cbd237dc-a459-4154-8f24-663235393f7a',
        disputeCase:        'f6878a58-dc1d-4539-9908-393a34e63768',
        clientName:         'Arvin Client 1 — Parramatta',
        clientEmail:        ARVIN_EMAIL,
        address:            '201 ARVIN ST PARRAMATTA',
        suburb:             'Parramatta',
        pid:                '2000001',
        caseReference:      'LTD-2026-ARV-001',
        assessedValue:      780000.00,
        appraisedValue:     810000.00,  // fixed: was 750000.00
    },
    {
        client:             'e4e7bd00-8f84-4484-a9b9-3021e5df25e2',
        property:           'f1daa280-7cea-4f65-941a-b559524b4f02',
        assessmentDocument: '98310e75-9366-426b-98e0-3358f657abb8',
        valuationNotice:    '41012ef4-09e8-45cc-a379-dee055ea3000',
        disputeCase:        '44050838-1be9-430e-8d62-62f8e6c371f9',
        clientName:         'Arvin Client 2 — Westmead',
        clientEmail:        ARVIN_EMAIL,
        address:            '202 ARVIN ST WESTMEAD',
        suburb:             'Westmead',
        pid:                '2000002',
        caseReference:      'LTD-2026-ARV-002',
        assessedValue:      1100000.00,
        appraisedValue:     1150000.00, // fixed: was 1050000.00
    },
    {
        client:             '38dbfe88-816b-41b5-86cc-97fb6b3b3d59',
        property:           '35ba498c-d5e4-46c2-b4b4-8bca96045ab0',
        assessmentDocument: '1d1cd325-987f-445f-889b-6f69355ad6b1',
        valuationNotice:    '76bfa554-8361-42b3-b696-8ddf5ca79e44',
        disputeCase:        'aed82772-8303-4360-a8b4-e950b5c52f1a',
        clientName:         'Arvin Client 3 — Merrylands',
        clientEmail:        ARVIN_EMAIL,
        address:            '203 ARVIN ST MERRYLANDS',
        suburb:             'Merrylands',
        pid:                '2000003',
        caseReference:      'LTD-2026-ARV-003',
        assessedValue:      430000.00,
        appraisedValue:     460000.00,  // fixed: was 410000.00
    },
    {
        client:             'c1bd7973-616d-4cfb-8bdc-6b17590ee2cd',
        property:           '3d31d269-a4d0-4573-83e2-e0c1c7920dd1',
        assessmentDocument: 'b5e767aa-9e06-40f8-b98d-6be8a23f8308',
        valuationNotice:    'c0644293-d68f-4fbf-9b43-406880330870',
        disputeCase:        '4bea0190-3fdc-4fa9-9bd4-de188a0272df',
        clientName:         'Arvin Client 4 — Granville',
        clientEmail:        ARVIN_EMAIL,
        address:            '204 ARVIN ST GRANVILLE',
        suburb:             'Granville',
        pid:                '2000004',
        caseReference:      'LTD-2026-ARV-004',
        assessedValue:      920000.00,
        appraisedValue:     960000.00,  // fixed: was 880000.00
    },
    {
        client:             '5610d525-5439-4231-a771-cb2637ec9d2b',
        property:           'b7322948-1615-4e42-9970-cf8890e1e6e8',
        assessmentDocument: '7b103280-1d88-448d-b723-2a886e5e1b87',
        valuationNotice:    '361fa262-269e-4252-8dfa-d024865ddafd',
        disputeCase:        '629f5d13-0a53-4009-8642-57f35b896cf1',
        clientName:         'Arvin Client 5 — Auburn',
        clientEmail:        ARVIN_EMAIL,
        address:            '205 ARVIN ST AUBURN',
        suburb:             'Auburn',
        pid:                '2000005',
        caseReference:      'LTD-2026-ARV-005',
        assessedValue:      1500000.00,
        appraisedValue:     1560000.00, // fixed: was 1450000.00
    },
];

const logger = new Logger('CaseClosedNoObjectionSeeder');

async function seedCase(
    dataSource: DataSource,
    c: CaseSeed,
    accountantId: string,
): Promise<void> {
    const clientRepo = dataSource.getRepository(Client);

    // ── 1. Client ──────────────────────────────────────────────────────────────
    const existingClient = await clientRepo.findOneBy({ id: c.client });
    if (!existingClient) {
        await clientRepo.save(
            clientRepo.create({
                id:                     c.client,
                name:                   c.clientName,
                email:                  c.clientEmail,
                status:                 ClientStatus.ACTIVE,
                assigned_accountant_id: accountantId,
            }),
        );
        logger.log(`  Seeded client:              ${c.clientName}`);
    } else {
        logger.log(`  Skipped client:             ${c.clientName} (exists)`);
    }

    // ── 2. Property ────────────────────────────────────────────────────────────
    const [existingProperty] = await dataSource.query(
        `SELECT id FROM properties WHERE id = $1`, [c.property],
    );
    if (!existingProperty) {
        await dataSource.query(`
            INSERT INTO properties
                (id, client_id, address, suburb, state, postcode, pid, ownership_pct, land_area_sqm, zoning)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
            c.property, c.client, c.address, c.suburb,
            'NSW', '', c.pid, 100.00, null, null,
        ]);
        logger.log(`  Seeded property:            ${c.address}`);
    } else {
        logger.log(`  Skipped property:           ${c.address} (exists)`);
    }

    // ── 3. Assessment Document ─────────────────────────────────────────────────
    const [existingDoc] = await dataSource.query(
        `SELECT id FROM assessment_documents WHERE id = $1`, [c.assessmentDocument],
    );
    if (!existingDoc) {
        await dataSource.query(`
            INSERT INTO assessment_documents
                (id, client_id, file_path, document_name)
            VALUES ($1, $2, $3, $4)
        `, [
            c.assessmentDocument,
            c.client,
            `dispute-cases/${c.assessmentDocument}/valuation-notice.pdf`,
            'Valuation Notice 2025',
        ]);
        logger.log(`  Seeded assessment doc:      ${c.assessmentDocument}`);
    } else {
        logger.log(`  Skipped assessment doc:     ${c.assessmentDocument} (exists)`);
    }

    // ── 4. Valuation Notice ────────────────────────────────────────────────────
    const [existingNotice] = await dataSource.query(
        `SELECT id FROM valuation_notices WHERE id = $1`, [c.valuationNotice],
    );
    if (!existingNotice) {
        const delta = +(c.appraisedValue - c.assessedValue).toFixed(2);
        await dataSource.query(`
            INSERT INTO valuation_notices
                (id, property_id, source_document_id, appraised_by_id, valuation_date,
                 assessed_land_value, appraised_value, valuation_delta, decision_outcome,
                 is_exempt, notice_reference, analyst_notes, appraised_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
            c.valuationNotice,
            c.property,
            c.assessmentDocument,
            accountantId,
            '2024-07-01',
            c.assessedValue,
            c.appraisedValue,
            delta,
            'ADVISORY',
            false,
            `INTAKE-2025-${c.pid}`,
            '',
            '2026-04-06T11:39:08.126Z',
        ]);
        logger.log(`  Seeded valuation notice:    ${c.valuationNotice}`);
    } else {
        logger.log(`  Skipped valuation notice:   ${c.valuationNotice} (exists)`);
    }

    // ── 5. Dispute Case ────────────────────────────────────────────────────────
    const [existingCase] = await dataSource.query(
        `SELECT id FROM dispute_cases WHERE id = $1`, [c.disputeCase],
    );
    if (!existingCase) {
        await dataSource.query(`
            INSERT INTO dispute_cases
                (id, case_reference, client_id, property_id, valuation_notice_id,
                 assigned_accountant_id, assigned_lawyer_id, jurisdiction, status,
                 statutory_deadline, no_legal_ground_flagged, original_assessed_value,
                 analysis_report_blob_path)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
            c.disputeCase,
            c.caseReference,
            c.client,
            c.property,
            c.valuationNotice,
            accountantId,
            null,
            'NSW',
            'advisory_letter_issued',
            '2025-03-21',
            false,
            c.assessedValue,
            'clients/10f158ec-b176-46e0-9d40-35ffdf588a6b/disputes/54d5a0c9-c216-4002-a36b-110c5122bb12/analysisReport/Sample Valuation Analysis Report.pdf',
        ]);
        logger.log(`  Seeded dispute case:        ${c.caseReference}`);
    } else {
        logger.log(`  Skipped dispute case:       ${c.caseReference} (exists)`);
    }
}

export async function seedCaseClosedNoObjection(dataSource: DataSource): Promise<void> {
    const userRepo = dataSource.getRepository(User);

    // ── Resolve users ──────────────────────────────────────────────────────────
    const april = await userRepo.findOneBy({ email: APRIL_EMAIL });
    if (!april) {
        throw new Error(`[CaseClosedNoObjectionSeeder] "${APRIL_EMAIL}" not found. Run seedUsers() first.`);
    }
    logger.log(`Resolved: ${april.fullName} (${april.id})`);

    const arvin = await userRepo.findOneBy({ email: ARVIN_EMAIL });
    if (!arvin) {
        throw new Error(`[CaseClosedNoObjectionSeeder] "${ARVIN_EMAIL}" not found. Run seedUsers() first.`);
    }
    logger.log(`Resolved: ${arvin.fullName} (${arvin.id})`);

    // ── Seed April's 5 cases ───────────────────────────────────────────────────
    logger.log('\n── April Clemente ───────────────────────────────────');
    await Promise.all(APRIL_CASES.map((c) => seedCase(dataSource, c, april.id)));

    // ── Seed Arvin's 5 cases ───────────────────────────────────────────────────
    logger.log('\n── Arvin Bermudez ───────────────────────────────────');
    await Promise.all(ARVIN_CASES.map((c) => seedCase(dataSource, c, arvin.id)));

    // ── Summary ────────────────────────────────────────────────────────────────
    logger.log('\n── Test endpoints ───────────────────────────────────');
    for (const c of [...APRIL_CASES, ...ARVIN_CASES]) {
        logger.log(`  GET /v1/dispute-cases/${c.disputeCase}  (${c.caseReference})`);
    }
}