import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from 'src/api/users/entities/user.entity';
import { Client } from 'src/api/clients/entities/client.entity';
import { seedAccScenario } from './accuracy-r1-r4.seeder';

/**
 * Accuracy test seeders — Ground 9 (R9 Concessions × 15 scenarios).
 * Sequences 23–37 (UUIDs: acc00001-00NN-4000-a000-000000000TTT).
 */

const logger = new Logger('AccuracyTestSeeder');
const ACCOUNTANT_EMAIL = 'april.clemente@ymlgroup.com.au';
const DEFAULT_CLIENT = 'Ash Ash Testing ATF Ash Ash Testing';

// ─── Scenario definitions ─────────────────────────────────────────────────────

const R9_001 = {
  seq: 23, id: 'ACC-R9-001',
  address: '21 BERNERA RD', suburb: 'Prestons', postcode: '2170',
  pid: '3042682', lotDp: 'Lot 9 DP 1053060', lot: '9', plan: '1053060',
  assessedValue: 6050000, priorValue: 5500000, landAreaSqm: 5333,
  zoningCode: 'E5', zoningLabel: 'Heavy Industrial',
  concessionMentions: [
    's14L(1)(A) Onsite Allowance — NOT applied — SEPP No 55 Cockle Creek Smelter contamination — onsite remediation required — $850,000 — XYZ Environmental Engineering Report April 2024',
  ],
  reportNotes: 'E5 Heavy Industrial. s14L(1)(A) Onsite Allowance not applied. SEPP No 55 Cockle Creek Smelter — active contamination — onsite remediation required. Remediation cost: $850,000 (XYZ Environmental Engineering Report, April 2024). Correct taxable value: $6,050,000 - $850,000 = $5,200,000. Annual overcharge: 1.6% * $850,000 = $13,600. Land Tax Management Act 1956 (NSW).',
};

const R9_002 = {
  seq: 24, id: 'ACC-R9-002',
  address: '45 ENTERPRISE DR', suburb: 'Smeaton Grange', postcode: '2567',
  pid: '7788991', lotDp: 'Lot 15 DP 778899', lot: '15', plan: '778899',
  assessedValue: 3500000, priorValue: 3200000, landAreaSqm: 2000,
  zoningCode: 'E3', zoningLabel: 'Productivity Support',
  concessionMentions: [
    's14L(1)(B) Offsite Allowance — NOT applied — DA/2023/9876 Condition 12 — $600,000 Narellan Road upgrade contribution — works OUTSIDE land boundary — Section 7.11 contribution plan',
  ],
  reportNotes: 'E3 Productivity Support. s14L(1)(B) Offsite Allowance not applied. DA/2023/9876 Condition 12: $600,000 contribution to Narellan Road upgrade — works outside land boundary (offsite). Section 7.11 contribution plan. Correct taxable: $3,500,000 - $600,000 = $2,900,000. Annual overcharge: 1.6% * $600,000 = $9,600.',
};

const R9_003 = {
  seq: 25, id: 'ACC-R9-003',
  address: 'BASEMENT LEVEL 1/200 GEORGE ST', suburb: 'Sydney', postcode: '2000',
  pid: '5566771', lotDp: 'Lot B1 DP 556677', lot: 'B1', plan: '556677',
  assessedValue: 5000000, priorValue: 4500000, landAreaSqm: 1000,
  zoningCode: 'B8', zoningLabel: 'Metropolitan Centre',
  concessionMentions: [
    's14L(2) Stratum Allowance — NOT applied — basement car park lot — 1,000 m2 below ground — no street frontage — VG applied surface commercial rate $5,000/m2 — correct stratum rate $1,500/m2',
  ],
  reportNotes: 'B8 Metropolitan Centre. Lot B1 DP 556677 — below-ground basement, 50 car park spaces, 1,000 m2, no street frontage. s14L(2) Stratum Allowance not applied. VG applied surface commercial rate $5,000/m2 * 1,000 m2 = $5,000,000. Correct stratum rate: $1,500/m2 * 1,000 m2 = $1,500,000. Overvaluation: $3,500,000. Annual overcharge: 1.6% * $3,500,000 = $56,000.',
};

const R9_004 = {
  seq: 26, id: 'ACC-R9-004',
  address: '200 ROUSE HILL RD', suburb: 'Rouse Hill', postcode: '2155',
  pid: '1122331', lotDp: 'Lot 1 DP 112233', lot: '1', plan: '112233',
  assessedValue: 4800000, priorValue: 4200000, landAreaSqm: 8000,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  concessionMentions: [
    's14T Subdividers Allowance — NOT applied — DA/2022/4567 — 12 residential lots — 4 sold, 8 unsold as at 1 July 2024 — unrecouped development costs $600,000 — risk/time discount $400,000',
  ],
  reportNotes: 'R2 subdivision. s14T Subdividers Allowance not applied. DA/2022/4567: 12-lot residential subdivision. Status: 4 lots sold, 8 unsold as at 1 July 2024. Development costs: $1,200,000 total; $600,000 incurred; $600,000 unrecouped. Risk/time discount: $400,000. Correct taxable: $4,800,000 - $600,000 - $400,000 = $3,800,000. Annual overcharge: 1.6% * $1,000,000 = $16,000.',
};

const R9_005 = {
  seq: 27, id: 'ACC-R9-005',
  address: '500 COALFIELD RD', suburb: 'Singleton', postcode: '2330',
  pid: '9900111', lotDp: 'Lot 22 DP 990011', lot: '22', plan: '990011',
  assessedValue: 3800000, priorValue: 3400000, landAreaSqm: 500000,
  zoningCode: 'RU1', zoningLabel: 'Primary Production',
  concessionMentions: [
    's14F(4) Coal Allowance — NOT applied — ML/2019/4567 Hunter Valley Coal Ltd — covers entire Lot 22 — restricts all alternative use — value restricted to 30% of unrestricted',
  ],
  reportNotes: '50 hectare rural lot. s14F(4) Coal Allowance not applied. Mining lease ML/2019/4567 — Hunter Valley Coal Ltd — covers entire Lot 22 — prohibits residential, commercial, or agricultural use while active. Correct value: $3,800,000 * 30% = $1,140,000. Annual overcharge: 1.6% * $2,660,000 = $42,560. Department of Resources NSW.',
};

const R9_006 = {
  seq: 28, id: 'ACC-R9-006',
  address: '88 PITT ST', suburb: 'Sydney', postcode: '2000',
  pid: '5544312', lotDp: 'Lot 3 SP 55443', lot: '3', plan: '55443', planType: 'SP',
  assessedValue: 8000000, priorValue: 7200000, landAreaSqm: 500,
  zoningCode: 'B8', zoningLabel: 'Metropolitan Centre',
  concessionMentions: [
    's14X MDAF — incorrectly applied — VG applied 40% residential factor — correct 90% (9,000 m2 residential floors 1-9 / 10,000 m2 total) — architectural floor plans confirm',
  ],
  reportNotes: 'B8 Metropolitan Centre. s14X Mixed Development Apportionment Factor (MDAF) incorrectly applied. Building: Ground floor 1,000 m2 retail; Floors 1-9: 9,000 m2 residential. Total 10,000 m2. Correct MDAF: 9,000 / 10,000 = 90% residential / 10% non-residential. VG applied 40% residential factor — error. VG taxable value: 40% * $8,000,000 = $3,200,000 (wrong). Correct taxable: 90% * $8,000,000 = $7,200,000.',
};

const R9_007 = {
  seq: 29, id: 'ACC-R9-007',
  address: '10 COMMERCE ST', suburb: 'Leichhardt', postcode: '2040',
  pid: '7788331', lotDp: 'Lot 2 DP 778833', lot: '2', plan: '778833',
  assessedValue: 2500000, priorValue: 2200000, landAreaSqm: 400,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  concessionMentions: [
    's14BBA MUAF — incorrect PPR portion — VG applied 30% PPR exempt/70% taxable — correct 60% PPR (front dwelling/garden/garage) / 40% taxable (rear cafe business) — electoral roll, utility bills, driver licence confirm PPR',
  ],
  reportNotes: 'Mixed use residential/commercial. s14BBA Mixed Use Apportionment Factor (MUAF) — purpose-based, not floor-area ratio (distinct from s14X MDAF). VG applied 30% PPR exempt/70% taxable = $1,750,000 taxable (incorrect). Correct: 60% PPR/40% taxable. Electoral roll, utility bills, driver licence confirm 10 Commerce Street as PPR. Council DA for cafe (rear 40%). Correct taxable: 40% * $2,500,000 = $1,000,000. Annual overcharge: 1.6% * $750,000 = $12,000.',
};

const R9_008 = {
  seq: 30, id: 'ACC-R9-008',
  address: '88 GRACE ST', suburb: 'Camperdown', postcode: '2050',
  pid: '4455991', lotDp: 'Lot 6 DP 445599', lot: '6', plan: '445599',
  assessedValue: 4000000, priorValue: 3600000, landAreaSqm: 2000,
  zoningCode: 'B4', zoningLabel: 'Mixed Use',
  concessionMentions: [
    's585 Attributable Part — partial charitable use — VG applied 20% charitable/80% taxable — correct 55% (2,200 m2 charitable floors 1-2 / 4,000 m2 total) / 45% taxable — ACNC: Western Sydney Community Services Inc ABN 55 666 777 888',
  ],
  reportNotes: 'Mixed use. s585 Attributable Part — partial charitable use (NOT full exemption). ACNC registered: Western Sydney Community Services Inc ABN 55 666 777 888. Floors 1-2: 2,200 m2 charitable (health clinic, food bank, support services). Part Level 2: 800 m2 commercial. Level 3: 1,000 m2 residential. Total 4,000 m2. Correct: 2,200 / 4,000 = 55% charitable / 45% taxable. VG: 20%/80% (wrong). Correct taxable: 45% * $4,000,000 = $1,800,000. Annual overcharge: 1.6% * $1,400,000 = $22,400.',
};

const R9_009 = {
  seq: 31, id: 'ACC-R9-009',
  address: '200 PITT ST', suburb: 'Sydney', postcode: '2000',
  pid: '7788331', lotDp: 'Lot 5 DP 778833', lot: '5', plan: '778833',
  assessedValue: 15000000, priorValue: 12500000, landAreaSqm: 600,
  zoningCode: 'B8', zoningLabel: 'Metropolitan Centre',
  concessionMentions: [
    's62K Land Tax Allowance — applied in 2023 ($2,500,000 reduction -> taxable $12,500,000) — removed in 2024 without notification — full taxable $15,000,000',
  ],
  reportNotes: 'B8 Metropolitan Centre. s62K Land Tax Allowance applied in 2023: $2,500,000 reduction -> taxable $12,500,000. Removed in 2024 with no notification from Revenue NSW. 2024 assessment: no s62K allowance, full taxable $15,000,000. Annual overcharge from removal: 2.0% * $2,500,000 = $50,000.',
};

const R9_010 = {
  seq: 32, id: 'ACC-R9-010',
  address: '6 THE CRESCENT', suburb: 'Annandale', postcode: '2038',
  pid: '3344551', lotDp: 'Lot 2 DP 334455', lot: '2', plan: '334455',
  assessedValue: 2400000, priorValue: 2100000, landAreaSqm: 550,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  heritageMentions: [
    'NSW State Heritage Register Item 01234 — Victorian terrace with curtilage restrictions — Section 10.7 Planning Certificate Inner West Council — demolition/alteration/development requires Heritage Council approval',
  ],
  concessionMentions: [
    's124 Heritage Act 1977 (NSW) — heritage restriction not reflected in value — VG used non-heritage comparables $3,000/m2 — no 20% heritage discount applied',
  ],
  reportNotes: 'R2. Heritage NSW SHR Item 01234 — Victorian terrace. Section 10.7 (Inner West Council) confirms heritage. s124 Heritage Act 1977 (NSW) + Valuation of Land Act 1916 (NSW). VG used non-heritage comparable land at $3,000/m2 * 550 m2 = $1,650,000 baseline — no heritage discount. Correct: $1,650,000 * 80% = $1,320,000 (20% heritage discount). Overvaluation: $1,080,000.',
};

const R9_011 = {
  seq: 33, id: 'ACC-R9-011',
  address: '44 BRIGHTON RD', suburb: 'Cronulla', postcode: '2230',
  pid: '5566991', lotDp: 'Lot 4 DP 556699', lot: '4', plan: '556699',
  assessedValue: 1800000, priorValue: 1600000, landAreaSqm: 600,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  concessionMentions: [
    'PPR Partial Exemption — VG applied 50% PPR exempt/50% taxable — correct 70% PPR (main dwelling, garden, garage) / 30% taxable (rear studio Airbnb rental) — electoral roll, utility bills, driver licence confirm PPR',
  ],
  reportNotes: 'R2. PPR partial exemption. VG applied 50% exempt/50% taxable = $900,000 taxable (incorrect). Correct: 70% main dwelling PPR (exempt) / 30% rear studio Airbnb (taxable). Electoral roll, utility bills, driver licence at 44 Brighton Road Cronulla confirm PPR. Floor plan confirms 70/30. Correct taxable: 30% * $1,800,000 = $540,000. Annual overcharge: 1.6% * $360,000 = $5,760.',
};

const R9_012 = {
  seq: 34, id: 'ACC-R9-012',
  address: '350 MEADOW LN', suburb: 'Young', postcode: '2594',
  pid: '1122001', lotDp: 'Lot 1 DP 112200', lot: '1', plan: '112200',
  assessedValue: 2800000, priorValue: 2500000, landAreaSqm: 1200000,
  zoningCode: 'RU1', zoningLabel: 'Primary Production',
  concessionMentions: [
    'Primary Production exemption — NOT applied on 2024 assessment — ABN 11 222 333 444 Ash Ash Orchards — active cherry orchard + cattle grazing — $380,000 primary production income 2022-23 ATO — fully exempt',
  ],
  reportNotes: '120 hectare rural. Primary Production exemption not applied. RU1 Primary Production — Hilltops LEP 2021 (Section 10.7 confirms). ABN 11 222 333 444 — Ash Ash Orchards (registered primary producer). 2022-23 ATO income statement: $380,000 primary production income. Correct taxable value: $0 (fully exempt). Annual overcharge: 1.6% * $2,800,000 = $44,800.',
};

const R9_013 = {
  seq: 35, id: 'ACC-R9-013',
  address: '75 CHARITY LN', suburb: 'Parramatta', postcode: '2150',
  pid: '3344221', lotDp: 'Lot 9 DP 334422', lot: '9', plan: '334422',
  assessedValue: 3500000, priorValue: 3200000, landAreaSqm: 800,
  zoningCode: 'R3', zoningLabel: 'Medium Density Residential',
  clientName: 'Western Sydney Community Services Inc',
  concessionMentions: [
    'Charitable use FULL exemption — NOT applied — 100% charitable use — Western Sydney Community Services Inc ABN 55 666 777 888 ACNC registered — ground floor health clinic, Level 1 food bank, Level 2 youth/DV support — NOT s585 partial',
  ],
  reportNotes: '100% charitable use — full exemption (NOT s585 partial attribution). ACNC registered: Western Sydney Community Services Inc ABN 55 666 777 888. All 3 levels: Ground floor health clinic, Level 1 food bank + community support, Level 2 youth counselling + DV support. No commercial or residential use. Correct taxable: $0 (fully exempt). Annual overcharge: 1.6% * $3,500,000 = $56,000.',
};

const R9_014 = {
  seq: 36, id: 'ACC-R9-014',
  address: '50 SUNSET DR', suburb: 'Pymble', postcode: '2073',
  pid: '3344991', lotDp: 'Lot 1 DP 334499', lot: '1', plan: '334499',
  assessedValue: 8000000, priorValue: 7200000, landAreaSqm: 3000,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  clientName: 'Pymble Retirement Living Pty Ltd',
  concessionMentions: [
    'Retirement Village exemption — NOT applied — NSW Fair Trading Registration RV/2005/0234 — Retirement Villages Act 1999 (NSW) — Pymble Retirement Living Pty Ltd',
  ],
  reportNotes: 'Retirement village. Retirement Village exemption not applied. NSW Fair Trading registration RV/2005/0234. Enabling legislation: Retirement Villages Act 1999 (NSW). Operator: Pymble Retirement Living Pty Ltd. Occupation agreements and annual report attached. Correct taxable: $0 (fully exempt). Annual overcharge: 2.0% * $8,000,000 = $160,000.',
};

const R9_015 = {
  seq: 37, id: 'ACC-R9-015',
  address: '33 NEW SETTLEMENT RD', suburb: 'Kellyville', postcode: '2155',
  pid: '8899771', lotDp: 'Lot 8 DP 889977', lot: '8', plan: '889977',
  assessedValue: 1200000, priorValue: 1100000, landAreaSqm: 600,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  concessionMentions: [
    'Under Construction allowance — NOT applied — CC/2024/1234 (Blacktown City Council, 15 January 2024) — PPR intent (statutory declaration) — expected completion June 2025 — Ash Ash Builders Pty Ltd $680,000',
  ],
  reportNotes: 'R2. PPR under construction. Under Construction allowance not applied. CC/2024/1234 issued by Blacktown City Council 15 January 2024. Building contract: Ash Ash Builders Pty Ltd $680,000 (signed January 2024). Completion: June 2025. Statutory declaration: Ash Ash Testing ATF Ash Ash Testing will occupy as PPR on completion. Annual overcharge: 1.6% * $1,200,000 = $19,200.',
};

// ─── Main export ─────────────────────────────────────────────────────────────

export async function seedAccuracyR9(dataSource: DataSource): Promise<void> {
  const userRepo = dataSource.getRepository(User);
  const accountant = await userRepo.findOneBy({ email: ACCOUNTANT_EMAIL });
  if (!accountant) {
    throw new Error(`[AccuracyTestSeeder] "${ACCOUNTANT_EMAIL}" not found — run seedUsers() first.`);
  }

  const clientRepo = dataSource.getRepository(Client);
  logger.log('\n── Accuracy tests: Ground 9 (R9 Concessions × 15) ──────────────');

  for (const scenario of [
    R9_001, R9_002, R9_003, R9_004, R9_005,
    R9_006, R9_007, R9_008, R9_009, R9_010,
    R9_011, R9_012, R9_013, R9_014, R9_015,
  ]) {
    await seedAccScenario(dataSource, clientRepo, accountant.id, scenario);
  }
}
