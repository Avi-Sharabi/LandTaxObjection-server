import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from 'src/api/users/entities/user.entity';
import { Client, ClientStatus } from 'src/api/clients/entities/client.entity';

/**
 * Seeds one dispute case for Castle Hill Glen (PID 3701422) together with a
 * pre-built SupportingEvidenceContext stored in dispute_ai_snapshots.
 *
 * When analyze-ai runs on this case the processor reads the snapshot and skips
 * PropertyContextService.gather() (ePlanning/geocoding) and
 * gatherEntityEvidence() (Puppeteer/ABR), so Claude generation runs against
 * fixed, deterministic inputs without external credentials.
 *
 * Test:
 *   POST /api/dispute-cases/<DISPUTE_CASE_ID>/analyze-ai
 *   GET  /api/dispute-cases/<DISPUTE_CASE_ID>/objection-reasons
 *
 * DISPUTE_CASE_ID: c0a80101-0099-4000-a000-000000000005
 */

const ACCOUNTANT_EMAIL = 'april.clemente@ymlgroup.com.au';

const IDS = {
  client:           'c0a80101-0099-4000-a000-000000000001',
  property:         'c0a80101-0099-4000-a000-000000000002',
  assessmentDoc:    'c0a80101-0099-4000-a000-000000000003',
  valuationNotice:  'c0a80101-0099-4000-a000-000000000004',
  disputeCase:      'c0a80101-0099-4000-a000-000000000005',
};

const logger = new Logger('ObjectionReasonsTestSeeder');

export async function seedObjectionReasonsTest(dataSource: DataSource): Promise<void> {
  const userRepo = dataSource.getRepository(User);
  const clientRepo = dataSource.getRepository(Client);

  const accountant = await userRepo.findOneBy({ email: ACCOUNTANT_EMAIL });
  if (!accountant) {
    throw new Error(`[ObjectionReasonsTestSeeder] "${ACCOUNTANT_EMAIL}" not found — run seedUsers() first.`);
  }

  logger.log('\n── Objection reasons test case ─────────────────────────');

  const existingClient = await clientRepo.findOneBy({ id: IDS.client });
  if (!existingClient) {
    await clientRepo.save(
      clientRepo.create({
        id: IDS.client,
        name: 'CASTLE HILL GLEN PTY LTD ATF CASTLE HILL GLEN UNIT TRUST',
        email: 'objection-test@example.com',
        status: ClientStatus.ACTIVE,
        assigned_accountant_id: accountant.id,
      }),
    );
  }

  const [existingProp] = await dataSource.query(`SELECT id FROM properties WHERE id = $1`, [IDS.property]);
  if (!existingProp) {
    await dataSource.query(
      `INSERT INTO properties
         (id, client_id, address, suburb, state, postcode, pid,
          ownership_pct, land_area_sqm, zoning, lot_dp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        IDS.property, IDS.client,
        '1020 MELIA CT CASTLE HILL', 'Castle Hill', 'NSW', '2154', '3701422',
        100.00, 66167, 'C4 Environmental Living', 'Lot 1 DP 576773',
      ],
    );
  }

  const [existingDoc] = await dataSource.query(`SELECT id FROM assessment_documents WHERE id = $1`, [IDS.assessmentDoc]);
  if (!existingDoc) {
    await dataSource.query(
      `INSERT INTO assessment_documents (id, client_id, file_path, document_name)
       VALUES ($1,$2,$3,$4)`,
      [
        IDS.assessmentDoc, IDS.client,
        `dispute-cases/${IDS.assessmentDoc}/land-tax-notice.pdf`,
        'Land Tax Assessment Notice 2025',
      ],
    );
  }

  const [existingNotice] = await dataSource.query(`SELECT id FROM valuation_notices WHERE id = $1`, [IDS.valuationNotice]);
  if (!existingNotice) {
    await dataSource.query(
      `INSERT INTO valuation_notices
         (id, property_id, source_document_id, appraised_by_id, valuation_date,
          assessed_land_value, prior_land_value, land_area_vg_sqm,
          is_exempt, notice_reference, decision_outcome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        IDS.valuationNotice, IDS.property, IDS.assessmentDoc, accountant.id,
        '2025-07-01', 3800000, 3200000, 66167,
        false, 'INTAKE-2025-3701422', 'OBJECTION',
      ],
    );
  }

  const [existingCase] = await dataSource.query(`SELECT id FROM dispute_cases WHERE id = $1`, [IDS.disputeCase]);
  if (!existingCase) {
    await dataSource.query(
      `INSERT INTO dispute_cases
         (id, case_reference, client_id, property_id, valuation_notice_id,
          assigned_accountant_id, jurisdiction, status,
          statutory_deadline, no_legal_ground_flagged, original_assessed_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        IDS.disputeCase, 'LTD-2026-OBJ-001', IDS.client, IDS.property,
        IDS.valuationNotice, accountant.id, 'NSW', 'appraisal',
        '2025-09-30', false, 3800000,
      ],
    );
  }

  // Upsert the AI context snapshot so analyze-ai can run without external dependencies
  const mockContext = buildMockContext();
  await dataSource.query(
    `INSERT INTO dispute_ai_snapshots (dispute_case_id, context)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (dispute_case_id) DO UPDATE SET context = EXCLUDED.context`,
    [IDS.disputeCase, JSON.stringify(mockContext)],
  );

  logger.log(`  LTD-2026-OBJ-001  →  ${IDS.disputeCase}`);
  logger.log(`  Snapshot upserted in dispute_ai_snapshots`);
}

function buildMockContext(): Record<string, unknown> {
  return {
    propId: '3701422',
    confirmedAddress: '1020 MELIA CT CASTLE HILL NSW 2154',
    reportText:
      'Land Tax Assessment 2025. Owner: CASTLE HILL GLEN PTY LTD ATF CASTLE HILL GLEN UNIT TRUST. ' +
      'PID: 3701422. Lot 1 DP 576773. Land value: $3,800,000. ' +
      'Special trust rate applied at 2% flat — no threshold. ' +
      'Section 62K Land Tax allowance not applied.',
    apiData: {
      layers: [
        {
          layerName: 'Land Zoning Map',
          results: [{ Zone: 'C4', 'Zone Label': 'C4 Environmental Living' }],
        },
      ],
      sepp: [],
      warn: [],
      council: ['The Hills Shire Council'],
    },
    lat: -33.7324,
    lng: 151.0152,
    lotAreaM2: 66167,
    meta: {
      lot: '1',
      plan: '576773',
      planType: 'DP',
      assessed_land_value: 3800000,
      revenue_nsw_notice_date: '2025-07-01',
      fsr_from_pdf: null,
      land_area_sqm: 66167,
      height_limit_m: null,
      concession_mentions: [
        'Section 62K Land Tax allowance not applied — trust assessed under special trust rate (2% flat)',
      ],
      heritage_mentions: [],
      multiple_lots_in_report: [],
    },
    spatialBase64: null,
    contextBase64: null,
    closeupBase64: null,
    inputComparables: [
      {
        address: '25 MELIA CT CASTLE HILL NSW 2154',
        area_m2: 42000,
        zone: 'C4',
        analysed_land_value: 2400000,
        rate_per_m2: 57.14,
        contract_date: '2024-10-15',
      },
      {
        address: '7 BEAUMONT RD CASTLE HILL NSW 2154',
        area_m2: 55000,
        zone: 'C4',
        analysed_land_value: 3200000,
        rate_per_m2: 58.18,
        contract_date: '2024-08-22',
      },
      {
        address: '180 SHOWGROUND RD CASTLE HILL NSW 2154',
        area_m2: 70000,
        zone: 'C4',
        analysed_land_value: 4100000,
        rate_per_m2: 58.57,
        contract_date: '2025-01-10',
      },
    ],
    inputBenchmarkReport: null,
    landTaxNotice: {
      owner: 'CASTLE HILL GLEN PTY LTD ATF CASTLE HILL GLEN UNIT TRUST',
      issue_date: '2025-07-15',
      properties: [
        {
          address: '1020 MELIA CT CASTLE HILL NSW 2154',
          property_id: '3701422',
          land_values: { '2025': 3800000 },
        },
      ],
      total_aggregated_value: 3800000,
    },
    inputDocumentsText: [],
    entityEvidence: {
      groundDocIds: { '7': [], '9': [] },
      groundAnalysis: {
        '7':
          'ABR search confirms CASTLE HILL GLEN UNIT TRUST is registered as entity type Unit Trust. ' +
          'CASTLE HILL GLEN PTY LTD is the trustee. Entity names match the assessment notice exactly.',
        '9':
          'Revenue NSW Trusts page confirms a unit trust whose beneficiaries are presently entitled to all income ' +
          'qualifies as a fixed trust, not a special trust under LTMA s3A. ' +
          'Revenue NSW has applied the 2% flat special trust rate to this entity. ' +
          'ABR entity type is Unit Trust — not a discretionary trust.',
      },
      clientName: 'CASTLE HILL GLEN UNIT TRUST',
    },
    evidenceResult: null,
    caseDocuments: [],
  };
}
