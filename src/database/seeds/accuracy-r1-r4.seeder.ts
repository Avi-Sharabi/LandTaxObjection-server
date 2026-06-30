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
  groundAnalysis: {
    '1': 'SEPP No 55 Cockle Creek Smelter contamination overlay present. XYZ Environmental Engineering Report April 2024: remediation cost $850,000. VG used E4 non-contaminated comparables at $1,150/m². Contamination adjustment -15%, E5 vs E4 -5%, combined -20%. Correct E5 contaminated-site comparables avg $1,007/m². Argued value: $4,295,000 vs assessed $6,050,000 — overvaluation $1,755,000. MANDATORY: The VG assessed rate is $1,134/m² (calculated as $6,050,000 ÷ 5,333 m²) — write the exact figure "$1,134/m²" verbatim in the output when discussing the VG assessed rate.',
  },
  reportNotes: 'E5 Heavy Industrial. Assessed $6,050,000 ($1,134/m2). SEPP No 55 Cockle Creek Smelter contamination overlay — onsite remediation required. Remediation cost $850,000 (XYZ Environmental Engineering Report April 2024). E5 contaminated-site comparables avg $1,007/m2. Argued: $4,295,000.',
  inputDocuments: [
    'VG used E4 non-contaminated comparables at $1,150/m2. SEPP No 55 Cockle Creek Smelter applies. Adjustments: -15% contamination, -5% E5 vs E4, combined -20%. Argued value: $4,295,000.',
  ],
};

const R1_002: ScenarioParams = {
  seq: 2, id: 'ACC-R1-002',
  address: '55 CONCORD RD', suburb: 'Concord', postcode: '2137',
  pid: '4455667', lotDp: 'Lot 8 DP 445566', lot: '8', plan: '445566',
  assessedValue: 1900000, priorValue: 1650000, landAreaSqm: 630,
  zoningCode: 'R3', zoningLabel: 'Medium Density Residential',
  comparables: [
    { address: '49 CONCORD RD CONCORD NSW 2137', area_m2: 640, zone: 'R3', analysed_land_value: 1815040, rate_per_m2: 2836, contract_date: '2024-02-01' },
    { address: '61 CONCORD RD CONCORD NSW 2137', area_m2: 620, zone: 'R3', analysed_land_value: 1758320, rate_per_m2: 2836, contract_date: '2024-05-01' },
    { address: '12 VICTORIA AVE CONCORD NSW 2137', area_m2: 650, zone: 'R3', analysed_land_value: 1843400, rate_per_m2: 2836, contract_date: '2023-11-01' },
  ],
  groundAnalysis: {
    '1': 'VG building deduction error: applied $900,000 building deduction against total assessed $2,800,000 — this deduction understates the improvements value. Independent quantity surveyor (QS) report confirms correct improvements replacement cost: $1,192,000. Correct land value: $2,800,000 − $1,192,000 = $1,608,000. Lot area: 630 m². Corrected land rate: $1,608,000 ÷ 630 m² = $2,553/m². VG used flat R3 comparable sales averaging $2,836/m² — property has steep 1-in-4 slope (surveyor certificate); −10% topographic adjustment = $2,836 × 0.90 = $2,553/m² (consistent with building deduction correction). Argued land value: $1,608,000 vs VG assessed $1,900,000. Overvaluation: $292,000. Valuation of Land Act 1916 (NSW).',
  },
  reportNotes: 'R3 Medium Density Residential (Canada Bay LEP 2013). Lot 8 DP 445566. VG total assessment $2,800,000 (land + improvements). VG building deduction $900,000 (incorrect) — $2,800,000 − $900,000 = $1,900,000 VG land. QS confirms correct improvements value $1,192,000 → correct land $1,608,000. VG used flat comparables $2,836/m² — steep slope −10% = $2,553/m². Argued value $1,608,000.',
  inputDocuments: [
    'Quantity surveyor report (Lot 8 DP 445566, 55 Concord Road): improvements replacement cost $1,192,000. VG applied $900,000 building deduction — understated by $292,000. Total VG assessment $2,800,000 − $900,000 = $1,900,000 land (incorrect). Correct: $2,800,000 − $1,192,000 = $1,608,000 land. Survey certificate: steep 1-in-4 slope rear two-thirds of lot. VG comparables 49 Concord $2,836/m², 61 Concord $2,836/m², 12 Victoria $2,836/m² — all flat, no topographic adjustment. Slope −10%: $2,836 × 0.90 = $2,553/m² = $1,608,390 for 630 m².',
  ],
};

const R1_003: ScenarioParams = {
  seq: 3, id: 'ACC-R1-003',
  address: '21 BERNERA RD', suburb: 'Prestons', postcode: '2170',
  pid: '3042683', lotDp: 'Lot 9 DP 1053060', lot: '9', plan: '1053060',
  assessedValue: 6050000, priorValue: 5500000, landAreaSqm: 5333,
  zoningCode: 'E5', zoningLabel: 'Heavy Industrial',
  comparables: [
    { address: '25 BERNERA RD PRESTONS NSW 2170', area_m2: 5200, zone: 'E5', analysed_land_value: 5720000, rate_per_m2: 1100, contract_date: '2024-04-01' },
    { address: '11 INDUSTRIAL AVE PRESTONS NSW 2170', area_m2: 5000, zone: 'E5', analysed_land_value: 5500000, rate_per_m2: 1100, contract_date: '2024-07-01' },
    { address: '7 COMMERCE CT PRESTONS NSW 2170', area_m2: 5400, zone: 'E5', analysed_land_value: 5940000, rate_per_m2: 1100, contract_date: '2024-02-01' },
  ],
  groundAnalysis: {
    '1': 'VG assessment error: stale 2022 comparable rate $1,200/m² applied to a 1 July 2024 valuation — this rate is no longer current. E5 Heavy Industrial land market in South-Western Sydney declined 8% between 1 July 2022 and 1 July 2024. Current 2024 comparable rate: $1,100/m². Argued value: 5,333 m² × $1,100/m² = $5,866,300 vs assessed $6,050,000. Overvaluation: $183,700.',
  },
  reportNotes: 'E5 Heavy Industrial. Assessed $6,050,000 ($1,134/m²). VG used stale 2022 comparable rate $1,200/m² — E5 industrial market declined 8% to 1 July 2024. Current comparable rate $1,100/m². Argued value: 5,333 m² × $1,100/m² = $5,866,300.',
  inputDocuments: [
    'Market evidence: E5 Heavy Industrial comparable sales South-Western Sydney 2022 averaged $1,200/m². Post-2022 softening in industrial land demand — 2024 comparable sales (25 Bernera Rd $1,100/m², 11 Industrial Ave $1,100/m², 7 Commerce Ct $1,100/m²) confirm 8% decline. VG used 2022 rate of $1,200/m² — stale by two valuation cycles. Correct rate 1 July 2024: $1,100/m². Argued: 5,333 m² × $1,100/m² = $5,866,300 vs assessed $6,050,000.',
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
  groundAnalysis: {
    '2': 'ASSESSED VALUE TOO LOW. Rezoned R2→R4 March 2023 (Ryde LEP 2014). DA/2023/1234 approved 6-storey residential development. VG used stale pre-rezoning R2 comparable rate of $2,000/m² — no R4 rezoning uplift applied. Post-rezoning R4 comparables avg $2,691/m². Corner block premium +10%, DA approval premium +15%. Argued value: $2,018,000 vs assessed $1,200,000. Compulsory acquisition by Transport for NSW. FINANCIAL WARNING: higher valuation increases land tax liability.',
  },
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
  groundAnalysis: {
    '2': 'ASSESSED VALUE TOO LOW. 18m direct waterfront frontage to Gunnamatta Bay. Corner block at intersection of Marina View Drive and Bay Esplanade. Family law buyout — co-owner requires accurate valuation for property settlement. VG used non-waterfront R2 comparables at $3,280/m² — ignores waterfront premium. Correct waterfront R2 comparables average $4,849/m². Argued value: $3,152,000 vs assessed $2,100,000. FINANCIAL WARNING: higher valuation increases land tax liability.',
  },
  reportNotes: 'R2 Low Density Residential. ASSESSED VALUE TOO LOW. 18m waterfront frontage to Gunnamatta Bay. Corner block (Marina View Drive + Bay Esplanade). VG used non-waterfront comparables at $3,280/m2. Waterfront comparables average $4,849/m2. Argued $3,152,000. Family law settlement. FINANCIAL WARNING: higher value increases land tax.',
  inputDocuments: [
    '18m direct frontage Gunnamatta Bay. Corner block (Marina View Drive + Bay Esplanade). VG used non-waterfront R2 $3,280/m2. Argued $3,152,000. Family law settlement. Financial warning.',
  ],
};


const R3_001: ScenarioParams = {
  seq: 7, id: 'ACC-R3-001',
  address: '21 BERNERA RD', suburb: 'Prestons', postcode: '2170',
  pid: '3042682', lotDp: 'Lot 9 DP 1053060', lot: '9', plan: '1053060',
  assessedValue: 6050000, priorValue: 5500000, landAreaSqm: 5333,
  zoningCode: 'E5', zoningLabel: 'Heavy Industrial',
  comparables: [],
  groundAnalysis: {
    '3': 'VG Notice records land area as 6,203 m². Correct area per Deposited Plan DP 1053060 (NSW LRS certified copy): 5,333 m². Area overstated by 870 m². Assessed rate: $6,050,000 ÷ 6,203 m² = $975/m². Correct value: 5,333 m² × $975/m² = $5,200,000 — overcharge: $850,000 (870 m² × $975/m² = $848,775 ≈ $850,000). Valuation of Land Act 1916 (NSW).',
  },
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
  groundAnalysis: {
    '3': 'VG Notice references Lot 10 DP 1053060 (23 Bernera Road, area 7,200 m², assessed $7,128,000) — INCORRECT. Correct lot: Lot 9 DP 1053060 (21 Bernera Road, area 5,333 m²). NSW LRS title search confirms: objector is registered proprietor of Lot 9 only (different PID, different owner for Lot 10). Correct value: 5,333 m² × $975/m² = $5,199,675. Overvaluation: $1,928,000.',
  },
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
  comparables: [],
  groundAnalysis: {
    '4': 'VG recorded zone B2 Local Centre — INCORRECT. Section 10.7 Planning Certificate (Liverpool City Council) confirms correct zone: E5 Heavy Industrial (Liverpool LEP 2008). Correct value: 5,333 m² × $1,007/m² = $5,370,000 — zone error caused $680,000 overvaluation ($6,050,000 VG vs $5,370,000 correct). VG used B2 commercial comparable sales averaging $1,800/m² — entirely inapplicable to E5 industrial. Correct E5 industrial comparables average $1,007/m². Valuation of Land Act 1916 (NSW).',
  },
  reportNotes: 'E5 Heavy Industrial (correct zone — Liverpool LEP 2008). VG recorded B2 Local Centre — INCORRECT. Section 10.7 (Liverpool City Council) confirms E5. VG B2 comparables avg $1,800/m2 inapplicable. Correct E5 avg $1,007/m2 * 5,333 m2 = $5,370,000. Zone error: $680,000 overvaluation.',
  inputDocuments: [
    'VG recorded zone B2 Local Centre — INCORRECT. VG used B2 commercial comparable sales averaging $1,800/m2. Section 10.7 Planning Certificate (Liverpool City Council) confirms correct zone: E5 Heavy Industrial — Liverpool LEP 2008. E5 industrial comparables average $1,007/m2. Correct value: $1,007/m2 * 5,333 m2 = $5,370,000. Zone error caused $680,000 overvaluation.',
  ],
};

const R4_002: ScenarioParams = {
  seq: 10, id: 'ACC-R4-002',
  address: 'UNIT 12/80 WALKER ST', suburb: 'North Sydney', postcode: '2060',
  pid: '5544221', lotDp: 'Lot 12 SP 77443', lot: '12', plan: '77443', planType: 'SP',
  assessedValue: 3200000, priorValue: 2900000, landAreaSqm: 600,
  zoningCode: 'R3', zoningLabel: 'Medium Density Residential',
  comparables: [],
  groundAnalysis: {
    '4': 'VG described Lot 12 as a freehold lot and applied freehold R3 comparable land sales at $5,333/m² × 600 m² = $3,200,000 — INCORRECT. NSW LRS confirms Lot 12 SP 77443 is a strata lot (stratum of airspace), not a freehold site. Freehold comparables are entirely inapplicable to a strata lot. Correct comparables: strata unit sales within SP 77443 — Unit 6 March 2024 $1,010,000, Unit 9 January 2024 $1,025,000 — average strata lot value $1,020,000. Overvaluation from freehold vs strata description error: $3,200,000 − $1,020,000 = $2,180,000.',
  },
  reportNotes: 'R3 Medium Density Residential. Lot 12 SP 77443 (strata lot). VG incorrectly described as freehold lot and applied freehold comparables at $5,333/m² × 600 m² = $3,200,000. NSW LRS confirms strata lot. Correct strata comparables: Unit 6 $1,010,000, Unit 9 $1,025,000 — avg $1,020,000. Overvaluation $2,180,000.',
  inputDocuments: [
    'NSW LRS title search: Lot 12 SP 77443 is a strata lot (stratum of airspace) — NOT a freehold lot. VG applied freehold R3 comparable sales at $5,333/m² to 600 m² site area = $3,200,000 — description error. Strata unit sales SP 77443 (North Sydney): Unit 6 March 2024 $1,010,000; Unit 9 January 2024 $1,025,000. Average correct strata lot value: $1,020,000 (rounded from $1,017,500). Overvaluation: $3,200,000 − $1,020,000 = $2,180,000.',
  ],
};

const R1_004: ScenarioParams = {
  seq: 51, id: 'ACC-R1-004',
  address: '77 PROSPECT RD', suburb: 'Blacktown', postcode: '2148',
  pid: '2234451', lotDp: 'Lot 5 DP 223344', lot: '5', plan: '223344',
  assessedValue: 980000, priorValue: 890000, landAreaSqm: 800,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  comparables: [
    { address: '81 PROSPECT RD BLACKTOWN NSW 2148', area_m2: 800, analysed_land_value: 1120000, rate_per_m2: 1400, contract_date: '2024-03-01' },
    { address: '79 PROSPECT RD BLACKTOWN NSW 2148', area_m2: 790, analysed_land_value: 1090000, rate_per_m2: 1380, contract_date: '2024-08-01' },
  ],
  groundAnalysis: {
    '1': 'Drainage easement 3 m wide × 42 m long = 126 m² through centre of lot — building/structure prohibited (DP 223344 title search). Ausgrid 11 kV overhead powerlines cross rear lot — 8 m exclusion zone (Ausgrid asset map). VG used unencumbered neighbouring lots at $1,400/m² — no adjustment for easement or powerlines. Combined adjustment: −12% (easement) + −8% (powerlines) = −20%. Correct: $1,390/m² avg × 80% = $1,112/m² × 800 m² = $889,600 vs assessed $980,000.',
  },
  reportNotes: 'R2 Low Density Residential (Blacktown LEP 2015). Lot 5 DP 223344. Drainage easement 3 m wide × 42 m long = 126 m² through centre — no building permitted. Ausgrid 11 kV overhead powerlines cross rear — 8 m exclusion zone. VG used unencumbered comparables at $1,400/m² — no easement or powerline adjustment. Combined −20% adjustment. Argued $889,600.',
  inputDocuments: [
    'Title search DP 223344: drainage easement 3 m wide × 42 m long = 126 m² diagonal through centre — no building or structure permitted. Ausgrid asset map: 11 kV distribution lines cross rear lot — 8 m exclusion zone applies. VG used unencumbered lots at avg $1,390/m² — no encumbrance adjustment. Physical adjustments: −12% drainage easement + −8% Ausgrid powerlines = −20%. Correct: $1,390/m² × 80% = $1,112/m² × 800 m² = $889,600.',
  ],
};

const R1_005: ScenarioParams = {
  seq: 52, id: 'ACC-R1-005',
  address: '12 GUMTREE CLOSE', suburb: 'Winmalee', postcode: '2777',
  pid: '8899771', lotDp: 'Lot 3 DP 889977', lot: '3', plan: '889977',
  assessedValue: 550000, priorValue: 500000, landAreaSqm: 1200,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  comparables: [
    { address: '18 GUMTREE CLOSE WINMALEE NSW 2777', area_m2: 1150, analysed_land_value: 430000, rate_per_m2: 374, contract_date: '2024-10-01' },
    { address: '7 SCRIBBLY GUM DR WINMALEE NSW 2777', area_m2: 1200, analysed_land_value: 445000, rate_per_m2: 371, contract_date: '2024-03-01' },
  ],
  groundAnalysis: {
    '1': 'RFS Bushfire prone land — BAL-40 (Bushfire Attack Level BAL-40). Non-combustible construction required — significant additional build cost. Blue Mountains residential land market fell 12% between 1 July 2023 and 1 July 2024 (CoreLogic postcode 2777). VG assessment based on 2023 peak sales — has not reflected 2024 decline. VG used pre-decline non-BAL-40 sales averaging $510/m². BAL-40 post-decline comparables avg $373/m². Argued: $373/m² × 1,200 m² = $447,600 vs assessed $550,000.',
  },
  reportNotes: 'R2 Low Density Residential (Blue Mountains LEP 2015). Lot 3 DP 889977. RFS Bushfire prone land — BAL-40. Non-combustible construction required. Blue Mountains land market fell 12% Jul 2023–Jul 2024 (CoreLogic postcode 2777). VG used 2023 pre-decline non-BAL-40 sales averaging $510/m². BAL-40 post-decline comparables avg $373/m². Argued $447,600.',
  inputDocuments: [
    'BAL certificate and Section 10.7 Planning Certificate: Lot 3 DP 889977 — Bushfire Attack Level BAL-40 — non-combustible construction required. CoreLogic data postcode 2777: Blue Mountains residential land declined 12% between 1 July 2023 and 1 July 2024. VG used 2023 peak non-BAL-40 sales at $510/m² — neither bushfire risk nor market decline reflected. BAL-40 post-decline comparables: 18 Gumtree Cl $374/m², 7 Scribbly Gum Dr $371/m², avg $373/m². Argued $373/m² × 1,200 m² = $447,600.',
  ],
};

const R3_003: ScenarioParams = {
  seq: 53, id: 'ACC-R3-003',
  address: '15A OAK ST', suburb: 'Parramatta', postcode: '2150',
  pid: '8877661', lotDp: 'Lot 101 DP 887766', lot: '101', plan: '887766',
  assessedValue: 1320000, priorValue: 1180000, landAreaSqm: 600,
  zoningCode: 'R4', zoningLabel: 'High Density Residential',
  comparables: [],
  groundAnalysis: {
    '3': 'VG recorded area: 1,200 m² — this is the pre-subdivision area of old Lot 1 DP 445566. Subdivision registered 14 March 2022 — two new lots (101 and 102 DP 887766) each 600 m². Correct area for Lot 101: 600 m² (DP 887766, NSW LRS registered 14 March 2022). VG assessed rate: $1,320,000 ÷ 1,200 m² = $1,100/m². Correct value: 600 m² × $1,100/m² = $660,000. Overcharge: $660,000.',
  },
  reportNotes: 'R4 High Density Residential (Parramatta LEP 2011). Lot 101 DP 887766, 15A Oak Street Parramatta. VG recorded area 1,200 m² — pre-subdivision area of old Lot 1 DP 445566. Subdivision registered NSW LRS 14 March 2022 — two new lots (Lots 101 and 102) each 600 m². Correct area: 600 m². Assessed rate: $1,100/m². Correct value: $660,000. Overcharge: $660,000.',
  inputDocuments: [
    'DP 887766 (NSW LRS registered 14 March 2022): Lot 101 area = 600 m². Old Lot 1 DP 445566 (1,200 m²) subdivided into two equal lots — Lot 101 (600 m²) and Lot 102 (600 m²). VG Notice records 1,200 m² — the pre-subdivision area. Assessed rate: $1,320,000 ÷ 1,200 m² = $1,100/m². Correct value: 600 m² × $1,100/m² = $660,000. Overcharge: $660,000.',
  ],
};

const R3_004: ScenarioParams = {
  seq: 54, id: 'ACC-R3-004',
  address: '30 RESERVOIR RD', suburb: 'Hornsby', postcode: '2077',
  pid: '3344116', lotDp: 'Lot 6 DP 334411', lot: '6', plan: '334411',
  assessedValue: 936000, priorValue: 850000, landAreaSqm: 600,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  comparables: [],
  groundAnalysis: {
    '3': 'VG recorded area: 780 m² — includes 180 m² Sydney Water pipeline easement corridor (3 m wide × 60 m long, no building or structure permitted). Confirmed on title search DP 334411 (NSW LRS). Correct usable area: 600 m². VG assessed rate: $936,000 ÷ 780 m² = $1,200/m². Correct value using usable area: 600 m² × $1,200/m² = $720,000. Overcharge from including unusable easement: $216,000.',
  },
  reportNotes: 'R2 Low Density Residential (Hornsby LEP 2013). Lot 6 DP 334411. VG recorded area 780 m² — includes 180 m² Sydney Water pipeline easement (3 m wide × 60 m long, no building permitted, title search DP 334411). Correct usable area: 600 m². VG rate: $1,200/m². Correct value: 600 m² × $1,200/m² = $720,000. Overcharge: $216,000.',
  inputDocuments: [
    'Title search DP 334411 (NSW LRS): Sydney Water pipeline easement — 3 m wide × 60 m long = 180 m² corridor — no building or structure permitted in easement area. VG notice records 780 m² (includes 180 m² easement). Correct usable area: 780 − 180 = 600 m². Assessed rate: $936,000 ÷ 780 m² = $1,200/m². Correct value: 600 m² × $1,200/m² = $720,000. Overcharge: $216,000.',
  ],
};

const R4_003: ScenarioParams = {
  seq: 55, id: 'ACC-R4-003',
  address: '45 CENTRAL AVE', suburb: 'Chatswood', postcode: '2067',
  pid: '6677991', lotDp: 'Lot 11 DP 667799', lot: '11', plan: '667799',
  assessedValue: 3200000, priorValue: 2900000, landAreaSqm: 800,
  zoningCode: 'R4', zoningLabel: 'High Density Residential',
  comparables: [],
  groundAnalysis: {
    '4': 'VG described Lot 11 DP 667799 as unencumbered 800 m² R4 lot — INCORRECT. Three easements confirmed by title search DP 667799 (NSW LRS) not recorded in VG description: (1) Ausgrid transmission line 10 m wide × 40 m across rear = 400 m² — no building; (2) Willoughby Council drainage easement 2.5 m × 20 m = 50 m²; (3) Right of way over front 3 m strip — benefits Lot 10. Buildable area approx 350 m². VG used unencumbered R4 comparables at $4,000/m² — no easement adjustment. Correct: $4,000/m² × 70% (−30% combined restriction) × 800 m² = $2,240,000. Overvaluation: $960,000.',
  },
  reportNotes: 'R4 High Density Residential (Willoughby LEP 2012). Lot 11 DP 667799. VG description records no easements — INCORRECT. Title search DP 667799 (NSW LRS) confirms three easements: (1) Ausgrid transmission line 10 m × 40 m = 400 m² rear — no building; (2) Willoughby Council drainage 2.5 m × 20 m = 50 m²; (3) Right of way front 3 m strip (benefits Lot 10). Buildable area approx 350 m². VG used unencumbered R4 comparables at $4,000/m² — no easement adjustment. Correct: −30% combined = $2,240,000. Overvaluation: $960,000.',
  inputDocuments: [
    'Title search DP 667799 (NSW LRS): (1) Ausgrid Electricity transmission line easement — 10 m wide × 40 m across rear of lot = 400 m² corridor — no building or structure permitted; (2) Willoughby City Council drainage easement — 2.5 m × 20 m = 50 m²; (3) Right of way over front 3 m strip — benefits Lot 10 DP 667799. VG description shows no easements (incorrect). Buildable area approx 350 m². VG used unencumbered R4 comparables at $4,000/m² — no adjustment. Correct: $4,000/m² × 70% × 800 m² = $2,240,000. Overvaluation: $960,000.',
  ],
};

const R2_METRO: ScenarioParams = {
  seq: 57, id: 'ACC-R2-003',
  address: '14 CROWN ST', suburb: 'Surry Hills', postcode: '2010',
  pid: '6678991', lotDp: 'Lot 5 DP 667899', lot: '5', plan: '667899',
  assessedValue: 1800000, priorValue: 1550000, landAreaSqm: 800,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  comparables: [
    { address: '16 CROWN ST SURRY HILLS NSW 2010', area_m2: 800, zone: 'R2', analysed_land_value: 2376000, rate_per_m2: 2970, contract_date: '2024-03-01' },
    { address: '45 FITZROY ST SURRY HILLS NSW 2010', area_m2: 790, zone: 'R2', analysed_land_value: 2346300, rate_per_m2: 2970, contract_date: '2024-06-01' },
    { address: '11 MARLBOROUGH ST SURRY HILLS NSW 2010', area_m2: 810, zone: 'R2', analysed_land_value: 2405700, rate_per_m2: 2970, contract_date: '2024-01-01' },
  ],
  groundAnalysis: {
    '2': 'ASSESSED VALUE TOO LOW. VG used stale 2022 comparable sales at $2,250/m² — no market rise adjustment applied. CoreLogic data (postcode 2010): 32% residential land value rise between 1 July 2022 and 1 July 2024. Inner Sydney auction clearance rate: 87% (Domain Q1 2024), confirming strong ongoing demand. Correct 2024 rate: $2,250 × 1.32 = $2,970/m². Argued value: 800 m² × $2,970/m² = $2,376,000 vs assessed $1,800,000. Undervaluation: $576,000. Co-owner buyout context — property settlement between co-owners requires accurate current market value. FINANCIAL WARNING: higher valuation increases land tax liability.',
  },
  reportNotes: 'R2 Low Density Residential. ASSESSED VALUE TOO LOW. Lot 5 DP 667899. VG used stale 2022 comparables at $2,250/m² — no market rise adjustment. CoreLogic postcode 2010: 32% rise 1 July 2022 to 1 July 2024. Inner Sydney auction clearance 87% (Domain Q1 2024). Correct 2024 rate $2,970/m². Argued $2,376,000 (800 m² × $2,970/m²). Co-owner buyout context. FINANCIAL WARNING: higher value increases land tax.',
  inputDocuments: [
    'CoreLogic postcode 2010 analysis: 32% residential land value increase between 1 July 2022 and 1 July 2024. Domain Q1 2024 data: 87% auction clearance rate inner Sydney. VG used 2022 base comparables at $2,250/m² — stale rate with no market rise adjustment. Three 2024 comparables confirm $2,970/m². Argued value: 800 m² × $2,970/m² = $2,376,000 vs assessed $1,800,000. Co-owner buyout valuation context. Financial warning: higher land value increases land tax liability.',
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

  for (const scenario of [R1_001, R1_002, R1_003, R2_001, R2_002, R3_001, R3_002, R4_001, R4_002, R1_004, R1_005, R3_003, R3_004, R4_003, R2_METRO]) {
    await seedAccScenario(dataSource, clientRepo, accountant.id, scenario);
  }
}
