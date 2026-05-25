import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from 'src/api/users/entities/user.entity';
import { Client, ClientStatus } from 'src/api/clients/entities/client.entity';

/**
 * Seeds 4 dispute cases across two Western Sydney industrial precincts.
 * property_sales_raw is NOT touched here — use real imported data.
 *
 * Test: POST /api/comparables/generate  { "dispute_case_id": "<id>" }
 */

const ACCOUNTANT_EMAIL = 'april.clemente@ymlgroup.com.au';

interface CaseSeed {
  ids: {
    client: string;
    property: string;
    assessmentDocument: string;
    valuationNotice: string;
    disputeCase: string;
  };
  clientName: string;
  address: string;
  suburb: string;
  postcode: string;
  pid: string;
  lotDp: string;
  dimensions: string;
  heightLimitM: number;
  landAreaSqm: number;
  zoning: string;
  caseReference: string;
  vgCurrent: number;
  vgPrior: number;
  landAreaVgSqm: number;
  valuationDate: string;
}

const CASES: CaseSeed[] = [
  {
    ids: {
      client: 'c0a80101-0001-4000-a000-000000000001',
      property: 'c0a80101-0001-4000-a000-000000000002',
      assessmentDocument: 'c0a80101-0001-4000-a000-000000000003',
      valuationNotice: 'c0a80101-0001-4000-a000-000000000004',
      disputeCase: 'c0a80101-0001-4000-a000-000000000005',
    },
    clientName: 'Comp Test — Prestons E5 (4,022 m²)',
    address: '45 PRESTONS ROAD PRESTONS',
    suburb: 'Prestons',
    postcode: '2170',
    pid: '3049329',
    lotDp: 'Lot 10 / DP 1053060',
    dimensions: '120m x 34m',
    heightLimitM: 30.0,
    landAreaSqm: 4022,
    zoning: 'E5 Heavy Industrial',
    caseReference: 'LTD-2026-COMP-001',
    vgCurrent: 5_760_000,
    vgPrior: 4_730_000,
    landAreaVgSqm: 4_000,
    valuationDate: '2025-07-01',
  },
  {
    ids: {
      client: 'c0a80101-0002-4000-a000-000000000001',
      property: 'c0a80101-0002-4000-a000-000000000002',
      assessmentDocument: 'c0a80101-0002-4000-a000-000000000003',
      valuationNotice: 'c0a80101-0002-4000-a000-000000000004',
      disputeCase: 'c0a80101-0002-4000-a000-000000000005',
    },
    clientName: 'Comp Test — Prestons E5 (2,600 m²)',
    address: '19 VISCOUNT PLACE PRESTONS',
    suburb: 'Prestons',
    postcode: '2170',
    pid: '3049330',
    lotDp: 'Lot 4 / DP 1053060',
    dimensions: '65m x 40m',
    heightLimitM: 24.0,
    landAreaSqm: 2600,
    zoning: 'E5 Heavy Industrial',
    caseReference: 'LTD-2026-COMP-002',
    vgCurrent: 3_120_000,
    vgPrior: 2_600_000,
    landAreaVgSqm: 2_600,
    valuationDate: '2025-07-01',
  },
  {
    ids: {
      client: 'c0a80101-0003-4000-a000-000000000001',
      property: 'c0a80101-0003-4000-a000-000000000002',
      assessmentDocument: 'c0a80101-0003-4000-a000-000000000003',
      valuationNotice: 'c0a80101-0003-4000-a000-000000000004',
      disputeCase: 'c0a80101-0003-4000-a000-000000000005',
    },
    clientName: 'Comp Test — Moorebank E5 (8,500 m²)',
    address: '47 MOOREBANK AVENUE MOOREBANK',
    suburb: 'Moorebank',
    postcode: '2170',
    pid: '3049331',
    lotDp: 'Lot 22 / DP 1148220',
    dimensions: '170m x 50m',
    heightLimitM: 30.0,
    landAreaSqm: 8500,
    zoning: 'E5 Heavy Industrial',
    caseReference: 'LTD-2026-COMP-003',
    vgCurrent: 9_350_000,
    vgPrior: 7_800_000,
    landAreaVgSqm: 8_500,
    valuationDate: '2025-07-01',
  },
  {
    ids: {
      client: 'c0a80101-0004-4000-a000-000000000001',
      property: 'c0a80101-0004-4000-a000-000000000002',
      assessmentDocument: 'c0a80101-0004-4000-a000-000000000003',
      valuationNotice: 'c0a80101-0004-4000-a000-000000000004',
      disputeCase: 'c0a80101-0004-4000-a000-000000000005',
    },
    clientName: 'Comp Test — Chipping Norton IN1 (4,200 m²)',
    address: '67 CHIPPING NORTON AVENUE CHIPPING NORTON',
    suburb: 'Chipping Norton',
    postcode: '2170',
    pid: '3049332',
    lotDp: 'Lot 7 / DP 1162880',
    dimensions: '84m x 50m',
    heightLimitM: 12.0,
    landAreaSqm: 4200,
    zoning: 'IN1 General Industrial',
    caseReference: 'LTD-2026-COMP-004',
    vgCurrent: 4_200_000,
    vgPrior: 3_570_000,
    landAreaVgSqm: 4_200,
    valuationDate: '2025-07-01',
  },
];

const logger = new Logger('ComparablesTestSeeder');

async function seedCase(dataSource: DataSource, c: CaseSeed, accountantId: string): Promise<void> {
  const clientRepo = dataSource.getRepository(Client);

  const existingClient = await clientRepo.findOneBy({ id: c.ids.client });
  if (!existingClient) {
    await clientRepo.save(
      clientRepo.create({
        id: c.ids.client,
        name: c.clientName,
        email: `comp-test-${c.ids.client.slice(-4)}@example.com`,
        status: ClientStatus.ACTIVE,
        assigned_accountant_id: accountantId,
      }),
    );
  }

  const [existingProp] = await dataSource.query(`SELECT id FROM properties WHERE id = $1`, [c.ids.property]);
  if (!existingProp) {
    await dataSource.query(
      `INSERT INTO properties
         (id, client_id, address, suburb, state, postcode, pid,
          ownership_pct, land_area_sqm, zoning,
          lot_dp, dimensions, height_limit_m)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [c.ids.property, c.ids.client, c.address, c.suburb, 'NSW',
        c.postcode, c.pid, 100.00, c.landAreaSqm, c.zoning,
        c.lotDp, c.dimensions, c.heightLimitM],
    );
  }

  const [existingDoc] = await dataSource.query(`SELECT id FROM assessment_documents WHERE id = $1`, [c.ids.assessmentDocument]);
  if (!existingDoc) {
    await dataSource.query(
      `INSERT INTO assessment_documents (id, client_id, file_path, document_name)
       VALUES ($1,$2,$3,$4)`,
      [c.ids.assessmentDocument, c.ids.client,
        `dispute-cases/${c.ids.assessmentDocument}/valuation-notice.pdf`, 'Valuation Notice 2025'],
    );
  }

  const [existingNotice] = await dataSource.query(`SELECT id FROM valuation_notices WHERE id = $1`, [c.ids.valuationNotice]);
  if (!existingNotice) {
    await dataSource.query(
      `INSERT INTO valuation_notices
         (id, property_id, source_document_id, appraised_by_id, valuation_date,
          assessed_land_value, prior_land_value, land_area_vg_sqm,
          is_exempt, notice_reference, decision_outcome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [c.ids.valuationNotice, c.ids.property, c.ids.assessmentDocument, accountantId,
        c.valuationDate, c.vgCurrent, c.vgPrior, c.landAreaVgSqm,
        false, `INTAKE-2025-${c.pid}`, 'OBJECTION'],
    );
  }

  const [existingCase] = await dataSource.query(`SELECT id FROM dispute_cases WHERE id = $1`, [c.ids.disputeCase]);
  if (!existingCase) {
    await dataSource.query(
      `INSERT INTO dispute_cases
         (id, case_reference, client_id, property_id, valuation_notice_id,
          assigned_accountant_id, jurisdiction, status,
          statutory_deadline, no_legal_ground_flagged, original_assessed_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [c.ids.disputeCase, c.caseReference, c.ids.client, c.ids.property,
        c.ids.valuationNotice, accountantId, 'NSW', 'appraisal',
        '2025-09-30', false, c.vgCurrent],
    );
  }

  logger.log(`  ${c.caseReference}  ${c.ids.disputeCase}  (${c.clientName})`);
}

export async function seedComparablesTest(dataSource: DataSource): Promise<void> {
  const userRepo = dataSource.getRepository(User);

  const accountant = await userRepo.findOneBy({ email: ACCOUNTANT_EMAIL });
  if (!accountant) {
    throw new Error(`[ComparablesTestSeeder] "${ACCOUNTANT_EMAIL}" not found — run seedUsers() first.`);
  }

  logger.log('\n── Comparables test cases ───────────────────────────────');
  for (const c of CASES) {
    await seedCase(dataSource, c, accountant.id);
  }

  logger.log('\n── Dispute case IDs ─────────────────────────────────────');
  for (const c of CASES) {
    logger.log(`  ${c.caseReference}  →  ${c.ids.disputeCase}`);
  }
}
