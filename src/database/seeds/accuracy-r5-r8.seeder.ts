import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from 'src/api/users/entities/user.entity';
import { Client } from 'src/api/clients/entities/client.entity';
import { seedAccScenario } from './accuracy-r1-r4.seeder';

/**
 * Accuracy test seeders — Grounds 5–8 (R5 Wrong Person, R6 Apportionment, R7 With Other Land, R8 Separately).
 * Sequences 11–22 (UUIDs: acc00001-00NN-4000-a000-000000000TTT).
 */

const logger = new Logger('AccuracyTestSeeder');
const ACCOUNTANT_EMAIL = 'april.clemente@ymlgroup.com.au';
const DEFAULT_CLIENT = 'Ash Ash Testing ATF Ash Ash Testing';

// ─── R5 — Wrong Person ────────────────────────────────────────────────────────

const R5_001 = {
  seq: 11, id: 'ACC-R5-001',
  address: '21 BERNERA RD', suburb: 'Prestons', postcode: '2170',
  pid: '3042682', lotDp: 'Lot 9 DP 1053060', lot: '9', plan: '1053060',
  assessedValue: 6050000, priorValue: 5500000, landAreaSqm: 5333,
  zoningCode: 'E5', zoningLabel: 'Heavy Industrial',
  ownerOnNotice: 'John Smith', clientName: DEFAULT_CLIENT,
  groundAnalysis: {
    '7': 'ABR/NSW LRS: Notice names John Smith (incorrect). Registered proprietor: Ash Ash Testing ATF Ash Ash Testing (trust structure). Settlement 15 October 2023 — 8 months before valuation base date 1 July 2024. Revenue NSW must be separately notified to correct land tax liability from John Smith to Ash Ash Testing ATF Ash Ash Testing.',
  },
  reportNotes: 'E5 Heavy Industrial. Notice incorrectly names John Smith. Correct owner: Ash Ash Testing ATF Ash Ash Testing (trust). Settlement 15 October 2023. NSW LRS title search confirms registered proprietor. Revenue NSW must be notified.',
};

const R5_002 = {
  seq: 12, id: 'ACC-R5-002',
  address: '66 MAPLE ST', suburb: 'Epping', postcode: '2121',
  pid: '7788221', lotDp: 'Lot 3 DP 778822', lot: '3', plan: '778822',
  assessedValue: 1950000, priorValue: 1750000, landAreaSqm: 780,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  ownerOnNotice: "Margaret O'Brien", clientName: "Estate of Margaret O'Brien",
  groundAnalysis: {
    '7': "Notice names Margaret O'Brien (deceased 12 April 2022). Estate of Margaret O'Brien — executor James O'Brien, Probate granted 15 September 2022 (NSW Supreme Court SC/2022/9876). Title remains in Margaret O'Brien's name at NSW LRS pending transmission. Revenue NSW must be notified to reassign liability to the estate.",
  },
  reportNotes: "R2 Low Density Residential. R5 — Wrong Person. Notice issued to Margaret O'Brien (deceased 12 April 2022). Estate of Margaret O'Brien — executor James O'Brien, Probate granted 15 September 2022 (SC/2022/9876). Title remains in deceased's name at NSW LRS pending transmission. Revenue NSW must be notified to reassign liability to the estate.",
};

const R5_003 = {
  seq: 13, id: 'ACC-R5-003',
  address: '45 HARBOUR VIEW RD', suburb: 'Vaucluse', postcode: '2030',
  pid: '5567891', lotDp: 'Lot 12 DP 556789', lot: '12', plan: '556789',
  assessedValue: 2800000, priorValue: 2500000, landAreaSqm: 650,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  ownerOnNotice: 'Michael Green', clientName: 'Green Holdings Pty Ltd ATF Green Family Trust',
  entityClientName: 'Green Holdings Pty Ltd ATF Green Family Trust',
  groundAnalysis: {
    '7': 'Notice names Michael Green (individual) — incorrect. Registered proprietor: Green Holdings Pty Ltd (ACN 222 333 444) ATF Green Family Trust — confirmed by NSW LRS title search and ASIC. Michael Green is a director of the corporate trustee but has no personal ownership interest. Settlement: 4 April 2019. Revenue NSW must be notified to reassign liability.',
  },
  reportNotes: 'R2 Low Density Residential (Woollahra LEP 2014). R5 — Wrong Person. Notice names Michael Green (individual) — incorrect. Registered proprietor: Green Holdings Pty Ltd (ACN 222 333 444) ATF Green Family Trust (NSW LRS + ASIC confirmed). Michael Green is a director only. Settlement 4 April 2019. Revenue NSW must be notified to reassign liability.',
};

// ─── R6 — Apportionment ───────────────────────────────────────────────────────

const R6_001 = {
  seq: 14, id: 'ACC-R6-001',
  address: 'UNIT 45/1 HARBOUR ST', suburb: 'Sydney', postcode: '2000',
  pid: '8765401', lotDp: 'Lot 45 SP 87654', lot: '45', plan: '87654', planType: 'SP',
  assessedValue: 600000, priorValue: 550000, landAreaSqm: 120,
  zoningCode: 'B8', zoningLabel: 'Metropolitan Centre',
  reportNotes: 'Strata lot SP 87654. VG applied 12% apportionment (based on 60 entitlements out of 500) = $600,000. Correct entitlement per SP 87654 (NSW LRS): Lot 45 = 45 unit entitlements out of 500 total = 9%. Correct value: 9% * $5,000,000 = $450,000. Overcharge: $150,000.',
  inputDocuments: [
    'Strata Plan SP 87654 (NSW LRS) Schedule of Entitlements: Lot 45 = 45 units; Total scheme = 500 units. Correct share = 45 / 500 = 9%. VG applied 12% (60 / 500) — error of 60 entitlements vs correct 45. Total scheme land value $5,000,000. Correct apportioned value: $450,000.',
  ],
};

const R6_002 = {
  seq: 15, id: 'ACC-R6-002',
  address: '99 PACIFIC HWY', suburb: 'Gordon', postcode: '2072',
  pid: '3344551', lotDp: 'Lot 7 DP 334455', lot: '7', plan: '334455',
  assessedValue: 1200000, priorValue: 1100000, landAreaSqm: 900,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  reportNotes: 'Tenants in Common (TIC). NSW LRS title search: Ash Ash Testing ATF Ash Ash Testing = 40%; Gordon Holdings Pty Ltd = 60%. VG reversed the shares — applied 60% to Ash Ash Testing ATF Ash Ash Testing. VG value: 60% * $2,000,000 = $1,200,000 (incorrect). Correct: 40% * $2,000,000 = $800,000. Overcharge: $400,000.',
};

const R6_003 = {
  seq: 16, id: 'ACC-R6-003',
  address: 'UNIT 12/100 PARK DR', suburb: 'Ryde', postcode: '2112',
  pid: '5566712', lotDp: 'Lot 12 CP 55667', lot: '12', plan: '55667', planType: 'CP',
  assessedValue: 450000, priorValue: 410000, landAreaSqm: 150,
  zoningCode: 'R3', zoningLabel: 'Medium Density Residential',
  reportNotes: 'Community title CP 55667. VG applied 15% (150 units of 1,000 total) = $450,000 (incorrect). Correct entitlement per CP 55667 (NSW LRS): Lot 12 = 80 units out of 1,000 total = 8%. Correct value: 8% * $3,000,000 = $240,000. Overcharge: $210,000.',
  inputDocuments: [
    'Community Plan CP 55667 (NSW LRS) Schedule of Entitlements: Lot 12 = 80 association schedule units; Total scheme = 1,000 units. VG applied 150 entitlements (15%) — wrong. Correct: 80 / 1,000 = 8%. Total scheme land value $3,000,000. Correct value: $240,000.',
  ],
};

const R6_004 = {
  seq: 17, id: 'ACC-R6-004',
  address: '1 MARTIN PL', suburb: 'Sydney', postcode: '2000',
  pid: '3344881', lotDp: 'Lot 1 DP 334488', lot: '1', plan: '334488',
  assessedValue: 7000000, priorValue: 6000000, landAreaSqm: 500,
  zoningCode: 'B8', zoningLabel: 'Metropolitan Centre',
  reportNotes: 'Commercial lease — 1 Martin Place Sydney. 25-year lease at $350,000/yr (market $500,000/yr), 18 years remaining. VG apportioned: lessor 70%/lessee 30% — incorrect. Correct (CPV Valuers May 2024): lessor 45%/lessee 55%. VG lessor value: 70% * $10,000,000 = $7,000,000. Correct lessor value: 45% * $10,000,000 = $4,500,000. Overcharge for lessor: $2,500,000.',
  inputDocuments: [
    'Lease agreement signed 1 January 2007 — 25-year term — $350,000/yr net rent (market rent $500,000/yr — $150,000/yr below market). 18 years remaining. Independent valuation — CPV Valuers — May 2024 — confirms 55% lessee / 45% lessor split. VG applied 70/30 (wrong).',
  ],
};

const R6_005 = {
  seq: 18, id: 'ACC-R6-005',
  address: '12 CROWN ST', suburb: 'Wollongong', postcode: '2500',
  pid: '5566771', lotDp: 'Lot 2 DP 556677', lot: '2', plan: '556677',
  assessedValue: 1200000, priorValue: 1100000, landAreaSqm: 400,
  zoningCode: 'MU1', zoningLabel: 'Mixed Use',
  reportNotes: 'MU1 Mixed Use. VG applied residential 40%/commercial 60% = $1,200,000 residential portion (incorrect). Correct use apportionment (floor area): residential 65%/commercial 35% = $1,950,000 residential. Overcharge: $750,000. Compulsory acquisition.',
  inputDocuments: [
    'Section 10.7 Planning Certificate — Wollongong Council — northern 65% residential use, southern 35% commercial use. Site plan confirms split. Independent valuation June 2024 confirms 65/35. VG applied 40/60 — incorrect. Correct residential: 65% * $3,000,000 = $1,950,000. Compulsory acquisition purpose.',
  ],
};

// ─── R7 — Should value with other land ───────────────────────────────────────

const R7_001 = {
  seq: 19, id: 'ACC-R7-001',
  address: '21 BERNERA RD', suburb: 'Prestons', postcode: '2170',
  pid: '3042682', lotDp: 'Lot 9 DP 1053060', lot: '9', plan: '1053060',
  assessedValue: 6050000, priorValue: 5500000, landAreaSqm: 5333,
  zoningCode: 'E5', zoningLabel: 'Heavy Industrial',
  multipleLots: [
    'Lot 9 DP 1053060 — 21 Bernera Road Prestons (PID 3042682) — $6,050,000',
    'Lot 10 DP 1053060 — 23 Bernera Road Prestons — $7,200,000',
  ],
  landTaxProperties: [
    { address: '21 BERNERA RD PRESTONS NSW 2170', property_id: '3042682', land_values: { '2025': 6050000 } },
    { address: '23 BERNERA RD PRESTONS NSW 2170', property_id: '3053060', land_values: { '2025': 7200000 } },
  ],
  reportNotes: 'E5 Heavy Industrial. Both lots same owner. DA/2022/5678 lodged: logistics warehouse combining Lots 9 and 10 DP 1053060. Combined site area: 5,333 + 7,200 = 12,533 m2. Combined market value with assembly premium: $15,500,000 ($6,050,000 + $7,200,000 + $2,250,000 assembly uplift). ABC Valuers June 2024.',
};

const R7_002 = {
  seq: 20, id: 'ACC-R7-002',
  address: '200 SHEEPSTATION RD', suburb: 'Goulburn', postcode: '2580',
  pid: '3344111', lotDp: 'Lot 1 DP 334411', lot: '1', plan: '334411',
  assessedValue: 900000, priorValue: 800000, landAreaSqm: 1500000,
  zoningCode: 'RU1', zoningLabel: 'Primary Production',
  multipleLots: [
    'Lot 1 DP 334411 — 200 Sheepstation Rd Goulburn (150ha, $900,000)',
    'Lot 2 DP 334411 — Goulburn (120ha, $720,000)',
    'Lot 3 DP 334412 — Goulburn (80ha, $480,000)',
  ],
  landTaxProperties: [
    { address: '200 SHEEPSTATION RD GOULBURN NSW 2580', property_id: 'LOT1', land_values: { '2025': 900000 } },
    { address: 'SHEEPSTATION RD GOULBURN NSW 2580 LOT2', property_id: 'LOT2', land_values: { '2025': 720000 } },
    { address: 'SHEEPSTATION RD GOULBURN NSW 2580 LOT3', property_id: 'LOT3', land_values: { '2025': 480000 } },
  ],
  reportNotes: 'Rural property — 3 lots operated as integrated farm. Water licence WL/2008/0123. Combined area: 350ha. Combined value: $2,900,000. RMB Rural Valuers April 2024. Compulsory acquisition.',
};

// ─── R8 — Should value separately ────────────────────────────────────────────

const R8_001 = {
  seq: 21, id: 'ACC-R8-001',
  address: 'LOT 4 DP 556677', suburb: 'Prestons', postcode: '2170',
  pid: '5566771', lotDp: 'Lot 4 DP 556677', lot: '4', plan: '556677',
  assessedValue: 630000, priorValue: 580000, landAreaSqm: 650,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  comparables: [
    { address: '12 ELM ST NSW', area_m2: 650, analysed_land_value: 576300, rate_per_m2: 886, contract_date: '2024-03-01' },
    { address: '8 OAK AVE NSW', area_m2: 640, analysed_land_value: 560000, rate_per_m2: 875, contract_date: '2024-05-01' },
  ],
  landTaxProperties: [
    { address: 'LOT 4 DP 556677', property_id: 'LOT4', land_values: { '2025': 630000 } },
    { address: 'LOT 5 DP 556677', property_id: 'LOT5', land_values: { '2025': 630000 } },
  ],
  reportNotes: 'VG issued one combined notice for Lot 4 DP 556677 AND Lot 5 DP 556677 — total $1,260,000. These lots are separately owned: Lot 4 owner = Ash Ash Testing ATF Ash Ash Testing; Lot 5 owner = Smith Family Holdings Pty Ltd. Different legal owners cannot be grouped. No amalgamation order. NSW LRS confirms separate titles. Lot 4 individual value: 650 m2 * $880/m2 (comparable avg) = $572,000. Grouped value attributed to Lot 4: $630,000. Overcharge for Lot 4: $58,000.',
};

const R8_002 = {
  seq: 22, id: 'ACC-R8-002',
  address: '30 COMMERCE RD', suburb: 'Wetherill Park', postcode: '2164',
  pid: '3344561', lotDp: 'Lot 10 DP 334456', lot: '10', plan: '334456',
  assessedValue: 1800000, priorValue: 1600000, landAreaSqm: 650,
  zoningCode: 'E3', zoningLabel: 'Productivity Support',
  landTaxProperties: [
    { address: '30 COMMERCE RD WETHERILL PARK NSW 2164', property_id: 'LOT10', land_values: { '2025': 1800000 } },
    { address: '32 COMMERCE RD WETHERILL PARK NSW 2164', property_id: 'LOT11', land_values: { '2025': 1700000 } },
  ],
  groundAnalysis: {
    '7': 'Lot 10: Ash Ash Testing (individual). Lot 11: Ash Ash Testing Pty Ltd ACN 777 888 999 (company — confirmed ASIC). Different legal entities.',
  },
  reportNotes: "VG issued one combined notice for Lot 10 DP 334456 AND Lot 11 DP 334456 — total $3,500,000. Different legal entities: Lot 10 owner = Ash Ash Testing (individual); Lot 11 owner = Ash Ash Testing Pty Ltd (ACN 777 888 999, company). Confirmed by NSW LRS title searches and ASIC. Different legal entities cannot be grouped regardless of name similarity. Revenue NSW: different land tax thresholds apply to individuals vs companies. Correct separate: Lot 10 $1,750,000; Lot 11 $1,650,000. Total $3,400,000 vs grouped $3,500,000.",
};

// ─── Main export ─────────────────────────────────────────────────────────────

export async function seedAccuracyR5R8(dataSource: DataSource): Promise<void> {
  const userRepo = dataSource.getRepository(User);
  const accountant = await userRepo.findOneBy({ email: ACCOUNTANT_EMAIL });
  if (!accountant) {
    throw new Error(`[AccuracyTestSeeder] "${ACCOUNTANT_EMAIL}" not found — run seedUsers() first.`);
  }

  const clientRepo = dataSource.getRepository(Client);
  logger.log('\n── Accuracy tests: Grounds 5–8 (R5/R6/R7/R8) ───────────────────');

  for (const scenario of [R5_001, R5_002, R5_003, R6_001, R6_002, R6_003, R6_004, R6_005, R7_001, R7_002, R8_001, R8_002]) {
    await seedAccScenario(dataSource, clientRepo, accountant.id, scenario);
  }
}
