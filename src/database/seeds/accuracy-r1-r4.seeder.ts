import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from 'src/api/users/entities/user.entity';
import { Client, ClientStatus } from 'src/api/clients/entities/client.entity';

/**
 * Accuracy test seeders — Grounds 1–4 (R1 Too High, R2 Too Low, R3 Area, R4 Description).
 * Sequences 01–10 (UUIDs: acc00001-00NN-4000-a000-000000000TTT).
 */

const logger = new Logger('AccuracyTestSeeder');
const ACCOUNTANT_EMAIL = 'april.clemente@ymlgroup.com.au';
const DEFAULT_CLIENT = 'Ash Ash Testing ATF Ash Ash Testing';

export function accIds(seq: number) {
  const s = String(seq).padStart(4, '0');
  return {
    client:          `acc00001-${s}-4000-a000-000000000001`,
    property:        `acc00001-${s}-4000-a000-000000000002`,
    assessmentDoc:   `acc00001-${s}-4000-a000-000000000003`,
    valuationNotice: `acc00001-${s}-4000-a000-000000000004`,
    disputeCase:     `acc00001-${s}-4000-a000-000000000005`,
  };
}

interface Comp {
  address: string;
  area_m2: number;
  zone?: string;
  analysed_land_value: number;
  rate_per_m2?: number;
  contract_date?: string;
}

interface ScenarioParams {
  seq: number;
  id: string;
  address: string;
  suburb: string;
  postcode: string;
  pid: string;
  lotDp: string;
  lot: string;
  plan: string;
  planType?: string;
  assessedValue: number;
  priorValue: number;
  landAreaSqm: number;
  zoningCode: string;
  zoningLabel: string;
  clientName?: string;
  ownerOnNotice?: string;
  entityClientName?: string;
  concessionMentions?: string[];
  heritageMentions?: string[];
  multipleLots?: string[];
  comparables?: Comp[];
  reportNotes: string;
  inputDocuments?: string[];
  landTaxProperties?: Array<{ address: string; property_id?: string; land_values?: Record<string, number> }>;
  groundAnalysis?: Record<string, string>;
}

export function buildAccContext(p: ScenarioParams): Record<string, unknown> {
  const ownerName = p.ownerOnNotice ?? (p.clientName ?? DEFAULT_CLIENT);
  return {
    propId: p.pid,
    confirmedAddress: `${p.address} ${p.suburb} NSW ${p.postcode}`,
    reportText:
      `Land Tax Assessment Notice 2025. Owner: ${ownerName}. PID: ${p.pid}. ` +
      `${p.lotDp}. Land value: $${p.assessedValue.toLocaleString()}. ${p.reportNotes}`,
    reportBuffer: null,
    apiData: {
      layers: [
        {
          layerName: 'Land Zoning Map',
          results: [{ Zone: p.zoningCode, 'Zone Label': p.zoningLabel }],
        },
      ],
      sepp: [],
      warn: [],
      council: [],
    },
    lat: -33.9,
    lng: 151.0,
    lotAreaM2: p.landAreaSqm,
    meta: {
      lot: p.lot,
      plan: p.plan,
      planType: p.planType ?? 'DP',
      assessed_land_value: p.assessedValue,
      revenue_nsw_notice_date: '2025-07-01',
      fsr_from_pdf: null,
      land_area_sqm: p.landAreaSqm,
      height_limit_m: null,
      concession_mentions: p.concessionMentions ?? [],
      heritage_mentions: p.heritageMentions ?? [],
      multiple_lots_in_report: p.multipleLots ?? [],
    },
    spatialBase64: null,
    contextBase64: null,
    closeupBase64: null,
    inputComparables: p.comparables ?? [],
    inputBenchmarkReport: null,
    landTaxNotice: {
      owner: ownerName,
      issue_date: '2025-07-15',
      properties: p.landTaxProperties ?? [
        {
          address: `${p.address} ${p.suburb} NSW ${p.postcode}`,
          property_id: p.pid,
          land_values: { '2025': p.assessedValue },
        },
      ],
      total_aggregated_value: p.assessedValue,
    },
    inputDocumentsText: p.inputDocuments ?? [],
    entityEvidence: p.groundAnalysis
      ? {
          groundDocIds: Object.fromEntries(Object.keys(p.groundAnalysis).map(k => [k, []])),
          groundAnalysis: p.groundAnalysis,
          clientName: p.entityClientName ?? (p.clientName ?? DEFAULT_CLIENT),
        }
      : null,
    evidenceResult: null,
  };
}

export async function seedAccScenario(
  dataSource: DataSource,
  clientRepo: ReturnType<DataSource['getRepository']>,
  accountantId: string,
  p: ScenarioParams,
): Promise<void> {
  const i = accIds(p.seq);
  const clientName = p.clientName ?? DEFAULT_CLIENT;

  const existing = await clientRepo.findOneBy({ id: i.client });
  if (!existing) {
    await clientRepo.save(
      clientRepo.create({
        id: i.client,
        name: clientName,
        email: `${p.id.toLowerCase().replace(/-/g, '.')}@accuracy-test.example.com`,
        status: ClientStatus.ACTIVE,
        assigned_accountant_id: accountantId,
      }),
    );
  }

  const [existingProp] = await dataSource.query(`SELECT id FROM properties WHERE id = $1`, [i.property]);
  if (!existingProp) {
    await dataSource.query(
      `INSERT INTO properties
         (id, client_id, address, suburb, state, postcode, pid,
          ownership_pct, land_area_sqm, zoning, lot_dp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        i.property, i.client, p.address, p.suburb, 'NSW', p.postcode, p.pid,
        100.00, p.landAreaSqm, `${p.zoningCode} ${p.zoningLabel}`, p.lotDp,
      ],
    );
  }

  const [existingDoc] = await dataSource.query(`SELECT id FROM assessment_documents WHERE id = $1`, [i.assessmentDoc]);
  if (!existingDoc) {
    await dataSource.query(
      `INSERT INTO assessment_documents (id, client_id, file_path, document_name)
       VALUES ($1,$2,$3,$4)`,
      [
        i.assessmentDoc, i.client,
        `dispute-cases/${i.assessmentDoc}/land-tax-notice.pdf`,
        'Land Tax Assessment Notice 2025',
      ],
    );
  }

  const [existingNotice] = await dataSource.query(`SELECT id FROM valuation_notices WHERE id = $1`, [i.valuationNotice]);
  if (!existingNotice) {
    await dataSource.query(
      `INSERT INTO valuation_notices
         (id, property_id, source_document_id, appraised_by_id, valuation_date,
          assessed_land_value, prior_land_value, land_area_vg_sqm,
          is_exempt, notice_reference, decision_outcome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        i.valuationNotice, i.property, i.assessmentDoc, accountantId,
        '2025-07-01', p.assessedValue, p.priorValue, p.landAreaSqm,
        false, `INTAKE-2025-${p.pid}`, 'OBJECTION',
      ],
    );
  }

  const [existingCase] = await dataSource.query(`SELECT id FROM dispute_cases WHERE id = $1`, [i.disputeCase]);
  if (!existingCase) {
    await dataSource.query(
      `INSERT INTO dispute_cases
         (id, case_reference, client_id, property_id, valuation_notice_id,
          assigned_accountant_id, jurisdiction, status,
          statutory_deadline, no_legal_ground_flagged, original_assessed_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        i.disputeCase, `LTD-2026-${p.id}`, i.client, i.property,
        i.valuationNotice, accountantId, 'NSW', 'appraisal',
        '2025-09-30', false, p.assessedValue,
      ],
    );
  }

  const ctx = buildAccContext(p);
  await dataSource.query(
    `INSERT INTO dispute_ai_snapshots (dispute_case_id, context)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (dispute_case_id) DO UPDATE SET context = EXCLUDED.context`,
    [i.disputeCase, JSON.stringify(ctx)],
  );

  if (p.comparables && p.comparables.length > 0) {
    await dataSource.query(`DELETE FROM comparable_sales WHERE dispute_case_id = $1`, [i.disputeCase]);
    for (const c of p.comparables) {
      await dataSource.query(
        `INSERT INTO comparable_sales
           (id, dispute_case_id, created_by_id,
            property_street_name, area, zoning,
            adjusted_land_value, adjusted_rate_per_sqm, contract_date)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          i.disputeCase, accountantId,
          c.address,
          c.area_m2,
          c.zone ?? null,
          c.analysed_land_value,
          c.rate_per_m2 ?? null,
          c.contract_date ?? null,
        ],
      );
    }
  }

  logger.log(`  ${p.id.padEnd(14)}  dispute_case ${i.disputeCase}`);
}

// ─── Scenario definitions ────────────────────────────────────────────────────

const R1_001: ScenarioParams = {
  seq: 1, id: 'ACC-R1-001',
  address: '21 BERNERA RD', suburb: 'Prestons', postcode: '2170',
  pid: '3042682', lotDp: 'Lot 9 DP 1053060', lot: '9', plan: '1053060',
  assessedValue: 6050000, priorValue: 5500000, landAreaSqm: 5333,
  zoningCode: 'E5', zoningLabel: 'Heavy Industrial',
  concessionMentions: [
    'SEPP No 55 Cockle Creek Smelter contamination overlay — onsite remediation required',
    'XYZ Environmental Engineering Report April 2024 — remediation cost $850,000',
  ],
  comparables: [
    { address: '18 BERNERA RD PRESTONS NSW 2170', area_m2: 5100, zone: 'E5', analysed_land_value: 5202000, rate_per_m2: 1020, contract_date: '2024-03-01' },
    { address: '33 ANZAC AVE PRESTONS NSW 2170', area_m2: 4900, zone: 'E5', analysed_land_value: 4949000, rate_per_m2: 1010, contract_date: '2024-06-01' },
    { address: '9 LENORE DR PRESTONS NSW 2170', area_m2: 5500, zone: 'E5', analysed_land_value: 5451500, rate_per_m2: 991, contract_date: '2023-09-01' },
  ],
  reportNotes: 'E5 Heavy Industrial. Assessed $6,050,000 ($1,134/m2). SEPP No 55 Cockle Creek Smelter contamination overlay — onsite remediation required. Remediation cost $850,000 (XYZ Environmental Engineering Report April 2024). E5 contaminated-site comparables avg $1,007/m2. Argued: $4,295,000.',
  inputDocuments: [
    'VG used E4 non-contaminated comparables at $1,150/m2. SEPP No 55 Cockle Creek Smelter applies. Adjustments: -15% contamination, -5% E5 vs E4, combined -20%. Argued value: $4,295,000.',
  ],
};

const R1_002: ScenarioParams = {
  seq: 2, id: 'ACC-R1-002',
  address: '55 CONCORD RD', suburb: 'Concord', postcode: '2137',
  pid: '4433221', lotDp: 'Lot 6 DP 443322', lot: '6', plan: '443322',
  assessedValue: 1650000, priorValue: 1480000, landAreaSqm: 700,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  comparables: [],
  reportNotes: 'R2 Low Density Residential (Canada Bay LEP 2013). VG used improved comparable sales without deducting dwelling value — correct land-only rate $2,553/m2. Steep rear slope -10%. Argued $1,608,000.',
  inputDocuments: [
    'VG used improved sales without deducting building value. 59 Concord Rd total $2,800,000 dwelling $900,000 land-only $1,900,000 710m2 $2,676/m2. 47 Concord Rd total $2,600,000 dwelling $850,000 land-only $1,750,000 720m2 $2,431/m2. 61 Concord Rd total $2,700,000 dwelling $875,000 land-only $1,825,000 715m2 $2,552/m2. Avg $2,553/m2. Steep rear slope -10%. Argued $1,608,000.',
  ],
};

const R1_003: ScenarioParams = {
  seq: 3, id: 'ACC-R1-003',
  address: '21 BERNERA RD', suburb: 'Prestons', postcode: '2170',
  pid: '3042682', lotDp: 'Lot 9 DP 1053060', lot: '9', plan: '1053060',
  assessedValue: 6050000, priorValue: 5500000, landAreaSqm: 5333,
  zoningCode: 'E5', zoningLabel: 'Heavy Industrial',
  comparables: [
    { address: 'JAN 2024 5100M2 E5 PRESTONS NSW 2170', area_m2: 5100, zone: 'E5', analysed_land_value: 5610000, rate_per_m2: 1100, contract_date: '2024-01-01' },
    { address: 'MAR 2024 5400M2 E5 PRESTONS NSW 2170', area_m2: 5400, zone: 'E5', analysed_land_value: 5940000, rate_per_m2: 1100, contract_date: '2024-03-01' },
    { address: 'NOV 2023 5200M2 E5 PRESTONS NSW 2170', area_m2: 5200, zone: 'E5', analysed_land_value: 5720000, rate_per_m2: 1100, contract_date: '2023-11-01' },
  ],
  reportNotes: 'E5 Heavy Industrial. VG relied on stale 2022 comparables averaging $1,200/m2. SW Sydney E5 market declined 8% Jan 2023–Jul 2024 (CoreLogic). Days on market increased from 45 to 90. Current E5 Prestons comparables average $1,100/m2. Argued $5,866,000.',
  inputDocuments: [
    'VG relied on stale 2022 comparables: Jun2022 5200m2 $6,240,000 $1,200/m2, Sep2022 5100m2 $6,120,000 $1,200/m2, Mar2022 4900m2 $5,880,000 $1,200/m2. SW Sydney E5 market declined 8% (CoreLogic) Jan2023-Jul2024. Days on market 45->90. Current comparables avg $1,100/m2. Argued $5,866,000.',
  ],
};

const R2_001: ScenarioParams = {
  seq: 4, id: 'ACC-R2-001',
  address: '42 STATION RD', suburb: 'Macquarie Park', postcode: '2113',
  pid: '9988211', lotDp: 'Lot 3 DP 998821', lot: '3', plan: '998821',
  assessedValue: 1200000, priorValue: 1050000, landAreaSqm: 600,
  zoningCode: 'R4', zoningLabel: 'High Density Residential',
  comparables: [
    { address: '38 STATION RD MACQUARIE PARK NSW 2113', area_m2: 580, zone: 'R4', analysed_land_value: 1560200, rate_per_m2: 2690, contract_date: '2024-02-01' },
    { address: '11 PITTWATER RD MACQUARIE PARK NSW 2113', area_m2: 610, zone: 'R4', analysed_land_value: 1650050, rate_per_m2: 2705, contract_date: '2024-05-01' },
    { address: '7 DELHI RD MACQUARIE PARK NSW 2113', area_m2: 590, zone: 'R4', analysed_land_value: 1580220, rate_per_m2: 2678, contract_date: '2023-10-01' },
  ],
  reportNotes: 'R4 High Density Residential (Ryde LEP 2014). ASSESSED VALUE TOO LOW. Rezoned R2→R4 March 2023. DA/2023/1234 approved 6-storey residential. VG used pre-rezoning R2 comparables avg $1,980/m2. R4 post-rezoning comparables avg $2,691/m2. Corner block +10%, DA approval +15%. Argued $2,018,000. Compulsory acquisition Transport for NSW. FINANCIAL WARNING: higher value increases land tax.',
  inputDocuments: [
    'Rezoned R2->R4 March 2023 (Ryde LEP 2014). DA/2023/1234 6-storey residential. VG used pre-rezoning R2 comparables avg $1,980/m2. Corner block +10%, DA approval +15%, total +25%. Argued $2,018,000. Compulsory acquisition Transport for NSW. Financial warning.',
  ],
};

const R2_002: ScenarioParams = {
  seq: 5, id: 'ACC-R2-002',
  address: '2 MARINA VIEW DR', suburb: 'Cronulla', postcode: '2230',
  pid: '5544331', lotDp: 'Lot 1 DP 554433', lot: '1', plan: '554433',
  assessedValue: 2100000, priorValue: 1900000, landAreaSqm: 650,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  comparables: [
    { address: '6 MARINA VIEW DR CRONULLA NSW 2230', area_m2: 640, zone: 'R2', analysed_land_value: 3200000, rate_per_m2: 5000, contract_date: '2024-01-01' },
    { address: '14 BAY ESPLANADE CRONULLA NSW 2230', area_m2: 660, zone: 'R2', analysed_land_value: 3100000, rate_per_m2: 4697, contract_date: '2024-04-01' },
    { address: '9 WATER ST CRONULLA NSW 2230', area_m2: 670, zone: 'R2', analysed_land_value: 3250000, rate_per_m2: 4851, contract_date: '2024-07-01' },
  ],
  reportNotes: 'R2 Low Density Residential. ASSESSED VALUE TOO LOW. 18m waterfront frontage to Gunnamatta Bay. Corner block (Marina View Drive + Bay Esplanade). VG used non-waterfront comparables at $3,280/m2. Waterfront comparables average $4,849/m2. Argued $3,152,000. Family law settlement. FINANCIAL WARNING: higher value increases land tax.',
  inputDocuments: [
    '18m direct frontage Gunnamatta Bay. Corner block (Marina View Drive + Bay Esplanade). VG used non-waterfront R2 $3,280/m2. Argued $3,152,000. Family law settlement. Financial warning.',
  ],
};

const R2_003: ScenarioParams = {
  seq: 6, id: 'ACC-R2-003',
  address: '44 HOLT ST', suburb: 'Surry Hills', postcode: '2010',
  pid: '8899221', lotDp: 'Lot 2 DP 889922', lot: '2', plan: '889922',
  assessedValue: 1800000, priorValue: 1380000, landAreaSqm: 250,
  zoningCode: 'R1', zoningLabel: 'General Residential',
  comparables: [
    { address: '48 HOLT ST SURRY HILLS NSW 2010', area_m2: 245, zone: 'R1', analysed_land_value: 2350000, rate_per_m2: 9592, contract_date: '2024-05-01' },
    { address: '31 COOPER ST SURRY HILLS NSW 2010', area_m2: 255, zone: 'R1', analysed_land_value: 2400000, rate_per_m2: 9412, contract_date: '2024-03-01' },
    { address: '9 ARTHUR ST SURRY HILLS NSW 2010', area_m2: 248, zone: 'R1', analysed_land_value: 2370000, rate_per_m2: 9556, contract_date: '2024-02-01' },
  ],
  reportNotes: 'R1 General Residential. ASSESSED VALUE TOO LOW. 32% Sydney inner-city market rise Jul 2022–Jul 2024 (CoreLogic). 87% auction clearance Q2 2024. VG used stale 2022 comparables. Current comparables average $9,520/m2. Argued $2,380,000. Co-owner dispute. FINANCIAL WARNING: higher value increases land tax.',
  inputDocuments: [
    '32% rise CoreLogic Jul2022-Jul2024. 87% auction clearance Q2 2024. VG used 2022 stale comparables. Argued $2,380,000. Co-owner dispute. Financial warning.',
  ],
};

const R3_001: ScenarioParams = {
  seq: 7, id: 'ACC-R3-001',
  address: '21 BERNERA RD', suburb: 'Prestons', postcode: '2170',
  pid: '3042682', lotDp: 'Lot 9 DP 1053060', lot: '9', plan: '1053060',
  assessedValue: 6050000, priorValue: 5500000, landAreaSqm: 5333,
  zoningCode: 'E5', zoningLabel: 'Heavy Industrial',
  comparables: [],
  reportNotes: 'E5 Heavy Industrial. VG Notice records land area as 6,203 m2. Correct area per Deposited Plan DP 1053060 (NSW LRS): 5,333 m2. Area overstated by 870 m2. Assessed rate: $6,050,000 / 6,203 m2 = $975/m2. Correct value: 5,333 m2 * $975/m2 = $5,199,675 (approx $5,200,000). Dollar overcharge: $850,000.',
  inputDocuments: [
    'NSW LRS DP 1053060 (certified copy): Lot 9 survey area = 5,333 m2. VG Assessment Notice 2025 records "Land area: 6,203 m2" which is the area of Lot 10 DP 1053060 combined — incorrect. Request VG correct area to 5,333 m2.',
  ],
};

const R3_002: ScenarioParams = {
  seq: 8, id: 'ACC-R3-002',
  address: '21 BERNERA RD', suburb: 'Prestons', postcode: '2170',
  pid: '3042682', lotDp: 'Lot 9 DP 1053060', lot: '9', plan: '1053060',
  assessedValue: 7128000, priorValue: 6200000, landAreaSqm: 5333,
  zoningCode: 'E5', zoningLabel: 'Heavy Industrial',
  comparables: [],
  reportNotes: 'E5 Heavy Industrial. VG Notice references Lot 10 DP 1053060 (23 Bernera Road, area 7,200 m2, assessed $7,128,000). Correct lot: Lot 9 DP 1053060 (21 Bernera Road, area 5,333 m2). Correct value: 5,333 m2 * $975/m2 = $5,199,675 (approx $5,200,000). Overvaluation: $1,928,000.',
  inputDocuments: [
    'NSW LRS title search: objector is registered proprietor of Lot 9 DP 1053060 only (21 Bernera Road, 5,333 m2). VG notice incorrectly references Lot 10 DP 1053060 (23 Bernera Road, area 7,200 m2, different PID, different owner). Lot 10 area (7,200 m2) * $975/m2 = $7,128,000 shown on notice. Correct: 5,333 m2 * $975/m2 = $5,199,675.',
  ],
};

const R4_001: ScenarioParams = {
  seq: 9, id: 'ACC-R4-001',
  address: '21 BERNERA RD', suburb: 'Prestons', postcode: '2170',
  pid: '3042682', lotDp: 'Lot 9 DP 1053060', lot: '9', plan: '1053060',
  assessedValue: 6050000, priorValue: 5500000, landAreaSqm: 5333,
  zoningCode: 'E5', zoningLabel: 'Heavy Industrial',
  comparables: [
    { address: '18 BERNERA RD PRESTONS NSW 2170', area_m2: 5100, zone: 'E5', analysed_land_value: 5202000, rate_per_m2: 1020, contract_date: '2024-03-01' },
    { address: '33 ANZAC AVE PRESTONS NSW 2170', area_m2: 4900, zone: 'E5', analysed_land_value: 4949000, rate_per_m2: 1010, contract_date: '2024-06-01' },
    { address: '9 LENORE DR PRESTONS NSW 2170', area_m2: 5500, zone: 'E5', analysed_land_value: 5451500, rate_per_m2: 991, contract_date: '2023-09-01' },
  ],
  reportNotes: 'E5 Heavy Industrial (correct zone — Liverpool LEP 2008). VG recorded B2 Local Centre — INCORRECT. Section 10.7 (Liverpool City Council) confirms E5. VG B2 comparables avg $1,800/m2 inapplicable. Correct E5 avg $1,007/m2 * 5,333 m2 = $5,370,000. Zone error: $680,000 overvaluation.',
  inputDocuments: [
    'VG recorded zone B2 Local Centre — INCORRECT. VG used B2 commercial comparable sales averaging $1,800/m2. Section 10.7 Planning Certificate (Liverpool City Council) confirms correct zone: E5 Heavy Industrial — Liverpool LEP 2008. E5 industrial comparables average $1,007/m2. Correct value: $1,007/m2 * 5,333 m2 = $5,370,000. Zone error caused $680,000 overvaluation.',
  ],
};

const R4_002: ScenarioParams = {
  seq: 10, id: 'ACC-R4-002',
  address: 'UNIT 12/80 WALKER ST', suburb: 'North Sydney', postcode: '2060',
  pid: '7744312', lotDp: 'Lot 12 SP 77443', lot: '12', plan: '77443', planType: 'SP',
  assessedValue: 3200000, priorValue: 2900000, landAreaSqm: 85,
  zoningCode: 'MU1', zoningLabel: 'Mixed Use',
  comparables: [],
  reportNotes: 'MU1 Mixed Use (North Sydney LEP 2013). Lot 12 SP 77443 — strata lot, Unit 12, 80 Walker Street North Sydney. VG described property as freehold and assessed at $3,200,000 (400 m2 * $8,000/m2 — development site rate). This is a strata lot: 85 m2 lot area. Correct value using strata comparable sales: 85 m2 * $12,000/m2 = $1,020,000. Overvaluation: $2,180,000.',
  inputDocuments: [
    'Strata Plan SP 77443 (NSW LRS) confirms: Lot 12 strata lot 85 m2, residential apartment in strata scheme. VG used freehold development site comparables at $8,000/m2 — entirely inappropriate for a strata apartment lot. Correct strata comparable sales (North Sydney MU1 apartments): $12,000/m2 of lot area. Correct value: 85 m2 * $12,000/m2 = $1,020,000.',
  ],
};

// ─── Main export ─────────────────────────────────────────────────────────────

export async function seedAccuracyR1R4(dataSource: DataSource): Promise<void> {
  const userRepo = dataSource.getRepository(User);
  const accountant = await userRepo.findOneBy({ email: ACCOUNTANT_EMAIL });
  if (!accountant) {
    throw new Error(`[AccuracyTestSeeder] "${ACCOUNTANT_EMAIL}" not found — run seedUsers() first.`);
  }

  const clientRepo = dataSource.getRepository(Client);
  logger.log('\n── Accuracy tests: Grounds 1–4 (R1/R2/R3/R4) ───────────────────');

  for (const scenario of [R1_001, R1_002, R1_003, R2_001, R2_002, R2_003, R3_001, R3_002, R4_001, R4_002]) {
    await seedAccScenario(dataSource, clientRepo, accountant.id, scenario);
  }
}
