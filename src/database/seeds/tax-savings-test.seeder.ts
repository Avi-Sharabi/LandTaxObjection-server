import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from 'src/api/users/entities/user.entity';
import { Client, ClientStatus } from 'src/api/clients/entities/client.entity';

/**
 * Seeds 5 dispute cases covering each LandTaxComputationService branch.
 * tax_saving/yml_revenue/client_savings are left NULL — populated by
 * POST /dispute-cases/:id/calculate-tax.
 *
 * Expected results after calculate-tax:
 *   LTD-2026-TAX-001  individual, below threshold  → tax_saving = $0
 *   LTD-2026-TAX-002  individual, standard          → tax_saving = $16,000
 *   LTD-2026-TAX-003  company/trust (threshold = 0) → tax_saving = $8,000
 *   LTD-2026-TAX-004  foreign individual (+4%)       → tax_saving = $56,000
 *   LTD-2026-TAX-005  individual, premium tier       → tax_saving = $16,000
 */

const ACCOUNTANT_EMAIL = 'april.clemente@ymlgroup.com.au';

interface TaxCaseSeed {
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
  landAreaSqm: number;
  caseReference: string;
  assessedLandValue: number;
  priorLandValue: number;
  appraisedValue: number;
  ownershipType: 'individual' | 'company_trust';
  isForeign: boolean;
  ymlFeeSharePct: number;
  expectedTaxSaving: string;
}

const CASES: TaxCaseSeed[] = [
  {
    ids: {
      client: 'c0a80105-0001-4000-a000-000000000001',
      property: 'c0a80105-0001-4000-a000-000000000002',
      assessmentDocument: 'c0a80105-0001-4000-a000-000000000003',
      valuationNotice: 'c0a80105-0001-4000-a000-000000000004',
      disputeCase: 'c0a80105-0001-4000-a000-000000000005',
    },
    clientName: 'Tax Test — TAX-001 — Individual, below threshold (tax_saving = 0)',
    address: '1 TAX TEST STREET SYDNEY',
    suburb: 'Sydney',
    postcode: '2000',
    pid: '5010001',
    landAreaSqm: 500,
    caseReference: 'LTD-2026-TAX-001',
    assessedLandValue: 900_000,
    priorLandValue: 765_000,
    appraisedValue: 750_000,
    ownershipType: 'individual',
    isForeign: false,
    ymlFeeSharePct: 20,
    expectedTaxSaving: '$0',
  },
  {
    ids: {
      client: 'c0a80105-0002-4000-a000-000000000001',
      property: 'c0a80105-0002-4000-a000-000000000002',
      assessmentDocument: 'c0a80105-0002-4000-a000-000000000003',
      valuationNotice: 'c0a80105-0002-4000-a000-000000000004',
      disputeCase: 'c0a80105-0002-4000-a000-000000000005',
    },
    clientName: 'Tax Test — TAX-002 — Individual, standard (tax_saving = 16,000)',
    address: '2 TAX TEST STREET PARRAMATTA',
    suburb: 'Parramatta',
    postcode: '2150',
    pid: '5010002',
    landAreaSqm: 1200,
    caseReference: 'LTD-2026-TAX-002',
    assessedLandValue: 3_500_000,
    priorLandValue: 2_975_000,
    appraisedValue: 2_500_000,
    ownershipType: 'individual',
    isForeign: false,
    ymlFeeSharePct: 20,
    expectedTaxSaving: '$16,000',
  },
  {
    ids: {
      client: 'c0a80105-0003-4000-a000-000000000001',
      property: 'c0a80105-0003-4000-a000-000000000002',
      assessmentDocument: 'c0a80105-0003-4000-a000-000000000003',
      valuationNotice: 'c0a80105-0003-4000-a000-000000000004',
      disputeCase: 'c0a80105-0003-4000-a000-000000000005',
    },
    clientName: 'Tax Test — TAX-003 — Company/trust, no threshold (tax_saving = 8,000)',
    address: '3 TAX TEST STREET NORTH SYDNEY',
    suburb: 'North Sydney',
    postcode: '2060',
    pid: '5010003',
    landAreaSqm: 800,
    caseReference: 'LTD-2026-TAX-003',
    assessedLandValue: 2_000_000,
    priorLandValue: 1_700_000,
    appraisedValue: 1_500_000,
    ownershipType: 'company_trust',
    isForeign: false,
    ymlFeeSharePct: 20,
    expectedTaxSaving: '$8,000',
  },
  {
    ids: {
      client: 'c0a80105-0004-4000-a000-000000000001',
      property: 'c0a80105-0004-4000-a000-000000000002',
      assessmentDocument: 'c0a80105-0004-4000-a000-000000000003',
      valuationNotice: 'c0a80105-0004-4000-a000-000000000004',
      disputeCase: 'c0a80105-0004-4000-a000-000000000005',
    },
    clientName: 'Tax Test — TAX-004 — Foreign individual, +4% surcharge (tax_saving = 56,000)',
    address: '4 TAX TEST STREET BONDI',
    suburb: 'Bondi',
    postcode: '2026',
    pid: '5010004',
    landAreaSqm: 2000,
    caseReference: 'LTD-2026-TAX-004',
    assessedLandValue: 4_000_000,
    priorLandValue: 3_400_000,
    appraisedValue: 3_000_000,
    ownershipType: 'individual',
    isForeign: true,
    ymlFeeSharePct: 20,
    expectedTaxSaving: '$56,000',
  },
  {
    ids: {
      client: 'c0a80105-0005-4000-a000-000000000001',
      property: 'c0a80105-0005-4000-a000-000000000002',
      assessmentDocument: 'c0a80105-0005-4000-a000-000000000003',
      valuationNotice: 'c0a80105-0005-4000-a000-000000000004',
      disputeCase: 'c0a80105-0005-4000-a000-000000000005',
    },
    clientName: 'Tax Test — TAX-005 — Individual, premium tier >$6.571M (tax_saving = 16,000)',
    address: '5 TAX TEST STREET MOSMAN',
    suburb: 'Mosman',
    postcode: '2088',
    pid: '5010005',
    landAreaSqm: 5000,
    caseReference: 'LTD-2026-TAX-005',
    assessedLandValue: 8_000_000,
    priorLandValue: 6_800_000,
    appraisedValue: 7_200_000,
    ownershipType: 'individual',
    isForeign: false,
    ymlFeeSharePct: 20,
    expectedTaxSaving: '$16,000',
  },
];

const logger = new Logger('TaxSavingsTestSeeder');

async function seedCase(dataSource: DataSource, c: TaxCaseSeed, accountantId: string): Promise<void> {
  const clientRepo = dataSource.getRepository(Client);

  const existingClient = await clientRepo.findOneBy({ id: c.ids.client });
  if (!existingClient) {
    await clientRepo.save(
      clientRepo.create({
        id: c.ids.client,
        name: c.clientName,
        email: `tax-test-${c.pid}@example.com`,
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
          ownership_pct, land_area_sqm, zoning, lot_dp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        c.ids.property, c.ids.client, c.address, c.suburb, 'NSW',
        c.postcode, c.pid, 100.00, c.landAreaSqm,
        'R2 Low Density Residential', `Lot 1 / DP ${c.pid}`,
      ],
    );
  }

  const [existingDoc] = await dataSource.query(`SELECT id FROM assessment_documents WHERE id = $1`, [c.ids.assessmentDocument]);
  if (!existingDoc) {
    await dataSource.query(
      `INSERT INTO assessment_documents (id, client_id, file_path, notice_date, valuation_year)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        c.ids.assessmentDocument, c.ids.client,
        `dispute-cases/${c.ids.disputeCase}/valuation-notice.pdf`,
        '2025-07-01', '2025',
      ],
    );
  }

  const [existingNotice] = await dataSource.query(`SELECT id FROM valuation_notices WHERE id = $1`, [c.ids.valuationNotice]);
  if (!existingNotice) {
    await dataSource.query(
      `INSERT INTO valuation_notices
         (id, property_id, source_document_id, appraised_by_id, valuation_date,
          assessed_land_value, prior_land_value, land_area_vg_sqm,
          appraised_value, is_exempt, notice_reference, decision_outcome,
          ownership_type, is_foreign)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        c.ids.valuationNotice, c.ids.property, c.ids.assessmentDocument, accountantId,
        '2025-07-01', c.assessedLandValue, c.priorLandValue, 0,
        c.appraisedValue, false, `INTAKE-2025-${c.pid}`, 'OBJECTION',
        c.ownershipType, c.isForeign,
      ],
    );
  }

  const [existingCase] = await dataSource.query(`SELECT id FROM dispute_cases WHERE id = $1`, [c.ids.disputeCase]);
  if (!existingCase) {
    await dataSource.query(
      `INSERT INTO dispute_cases
         (id, case_reference, client_id, property_id, valuation_notice_id,
          assigned_accountant_id, jurisdiction, status,
          statutory_deadline, no_legal_ground_flagged, original_assessed_value,
          yml_fee_share_pct, tax_saving, yml_revenue, client_savings)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        c.ids.disputeCase, c.caseReference, c.ids.client, c.ids.property,
        c.ids.valuationNotice, accountantId, 'NSW', 'appraisal',
        '2025-09-30', false, c.assessedLandValue,
        c.ymlFeeSharePct, null, null, null,
      ],
    );
  }

  logger.log(`  ${c.caseReference}  ${c.ids.disputeCase}  (expected: ${c.expectedTaxSaving})`);
}

export async function seedTaxSavingsTest(dataSource: DataSource): Promise<void> {
  const userRepo = dataSource.getRepository(User);

  const accountant = await userRepo.findOneBy({ email: ACCOUNTANT_EMAIL });
  if (!accountant) {
    throw new Error(`[TaxSavingsTestSeeder] "${ACCOUNTANT_EMAIL}" not found — run seedUsers() first.`);
  }

  logger.log('\n── Tax savings test cases ───────────────────────────────');
  for (const c of CASES) {
    await seedCase(dataSource, c, accountant.id);
  }

  logger.log('\n── Dispute case IDs ─────────────────────────────────────');
  for (const c of CASES) {
    logger.log(`  ${c.caseReference}  →  ${c.ids.disputeCase}`);
  }
}
