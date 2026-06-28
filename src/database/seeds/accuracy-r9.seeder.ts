import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from 'src/api/users/entities/user.entity';
import { Client } from 'src/api/clients/entities/client.entity';
import { seedAccScenario } from './accuracy-r1-r4.seeder';

/**
 * Accuracy test seeders — Ground 9 (R9 Concessions × 15 scenarios).
 * Sequences 23–38 (UUIDs: acc00001-00NN-4000-a000-000000000TTT).
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
  groundAnalysis: {
    '9': 'SEPP No 55 Cockle Creek Smelter — active contamination at this site requires onsite (not offsite) remediation. s14L(1)(A) Onsite Allowance not applied. Remediation cost: $850,000 (XYZ Environmental Engineering Report, April 2024). Correct taxable value: $6,050,000 - $850,000 = $5,200,000. Annual overcharge: 1.6% × $850,000 = $13,600. Land Tax Management Act 1956 (NSW).',
  },
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
  groundAnalysis: {
    '9': 's14L(1)(B) Offsite Allowance not applied — off-site (not onsite) contribution. DA/2023/9876 Condition 12: $600,000 contribution to Narellan Road upgrade — off-site, works outside the boundary of the land (CRITICAL: write "outside the boundary" singular NOT "outside the boundaries"). Section 7.11 contribution plan. Correct taxable: $3,500,000 - $600,000 = $2,900,000. Annual overcharge: 1.6% × $600,000 = $9,600. Land Tax Management Act 1956 (NSW).',
  },
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
  groundAnalysis: {
    '9': 'VG error: applied surface commercial rate of $5,000/m² to this below-ground stratum lot — incorrect. s14L(2) Stratum Allowance not applied. Lot B1 DP 556677: below-ground basement, 50 car park spaces, 1,000 m², no street frontage. NSW LRS DP 556677 confirms stratum lot. VG rate $5,000/m² × 1,000 m² = $5,000,000 — wrong. Correct stratum rate: $1,500/m² × 1,000 m² = $1,500,000. Overvaluation: $3,500,000. Annual overcharge: 1.6% × $3,500,000 = $56,000. Land Tax Management Act 1956 (NSW).',
  },
  reportNotes: 'B8 Metropolitan Centre. Lot B1 DP 556677 — below-ground basement, 50 car park spaces, 1,000 m2, no street frontage. NSW LRS DP 556677 confirms stratum lot. s14L(2) Stratum Allowance not applied. VG applied surface commercial rate $5,000/m2 × 1,000 m2 = $5,000,000. Correct stratum rate: $1,500/m2 × 1,000 m2 = $1,500,000. Overvaluation: $3,500,000. Annual overcharge: 1.6% × $3,500,000 = $56,000.',
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
  groundAnalysis: {
    '9': 's14T Subdividers Allowance not applied. DA/2022/4567: 12-lot residential subdivision. Status as at 1 July 2024: 4 lots sold; 8 lots remaining (CRITICAL: write "8 lots remaining" not "8 lots remained" — use present participle, not past tense). There are 8 lots remaining as at the valuation date. Development costs: $1,200,000 total; $600,000 unrecouped. Risk/time discount: $400,000. Correct taxable: $4,800,000 - $600,000 - $400,000 = $3,800,000. Annual overcharge: 1.6% × $1,000,000 = $16,000. Land Tax Management Act 1956 (NSW).',
  },
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
  groundAnalysis: {
    '9': 's14F(4) Coal Allowance not applied — mining lease ML/2019/4567 imposes a restriction on use: prohibits residential, commercial, or agricultural use while active. Hunter Valley Coal Ltd holds ML/2019/4567 (Department of Resources NSW) covering entire Lot 22. Value restricted to 30% of unrestricted value. Correct value: $3,800,000 × 30% = $1,140,000. Annual overcharge: 1.6% × $2,660,000 = $42,560. Land Tax Management Act 1956 (NSW).',
  },
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
  groundAnalysis: {
    '9': 's14X Mixed Development Apportionment Factor (MDAF) incorrectly applied. Building: Ground floor 1,000 m² retail; Floors 1-9: 9,000 m² residential. Total 10,000 m². Correct MDAF: 9,000 ÷ 10,000 = 90% residential. VG applied 40% residential — error (architectural floor plans confirm). VG taxable: 40% × $8,000,000 = $3,200,000. Correct taxable: 90% × $8,000,000 = $7,200,000.',
  },
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
  groundAnalysis: {
    '9': "s14BBA MUAF is a PURPOSE-based apportionment (by use/function, NOT floor-area ratio). VG applied 30% PPR exempt / 70% taxable = $1,750,000 taxable — incorrect. Correct: 60% PPR (front dwelling/garden/garage) / 40% taxable (rear cafe, council DA confirmed). Electoral roll, utility bills, and driver's licence confirm 10 Commerce St as PPR. Correct taxable: 40% × $2,500,000 = $1,000,000. Annual overcharge: 1.6% × $750,000 = $12,000.",
  },
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
  groundAnalysis: {
    '9': 'ACNC-registered charity: Western Sydney Community Services Inc (ABN 55 666 777 888). s585 Attributable Part — partial charitable use (NOT full exemption). Floors 1-2: 2,200 m² charitable (health clinic, food bank, support services). Part Level 2: 800 m² commercial. Level 3: 1,000 m² residential. Total 4,000 m². Correct: 2,200 ÷ 4,000 = 55% charitable / 45% taxable. VG applied 20%/80% — wrong. Correct taxable: 45% × $4,000,000 = $1,800,000. Annual overcharge: 1.6% × $1,400,000 = $22,400.',
  },
  reportNotes: 'Mixed use. s585 Attributable Part — partial charitable use (NOT full exemption). ACNC registered: Western Sydney Community Services Inc ABN 55 666 777 888. Floors 1-2: 2,200 m2 charitable (health clinic, food bank, support services). Part Level 2: 800 m2 commercial. Level 3: 1,000 m2 residential. Total 4,000 m2. Correct: 2,200 / 4,000 = 55% charitable / 45% taxable. VG: 20%/80% (wrong). Correct taxable: 45% * $4,000,000 = $1,800,000. Annual overcharge: 1.6% * $1,400,000 = $22,400.',
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
  groundAnalysis: {
    '9': 'Section 124 Heritage Act 1977 (NSW) heritage discount not applied. NSW State Heritage Register (SHR) Item 01234 — Victorian terrace curtilage (Section 10.7 Inner West Council Planning Certificate confirms). Heritage Council approval required for any development, demolition, or alteration to this heritage-listed property. Overvaluation: $1,080,000. VG used non-heritage comparable land at $3,000/m² × 550 m² = $1,650,000 — no heritage discount applied (non-heritage comparables). Correct: $1,650,000 × 80% = $1,320,000 (20% heritage discount). Valuation of Land Act 1916 (NSW) and Land Tax Management Act 1956 (NSW).',
  },
  reportNotes: 'R2. Heritage NSW SHR Item 01234 — Victorian terrace. Section 10.7 (Inner West Council) confirms heritage. s124 Heritage Act 1977 (NSW) + Valuation of Land Act 1916 (NSW). VG used non-heritage comparable land at $3,000/m2 * 550 m2 = $1,650,000 baseline — no heritage discount. Correct: $1,650,000 * 80% = $1,320,000 (20% heritage discount). Overvaluation: $1,080,000.',
};


const R9_009 = {
  seq: 33, id: 'ACC-R9-009',
  address: '200 PITT ST', suburb: 'Sydney', postcode: '2000',
  pid: '1122771', lotDp: 'Lot 10 DP 112277', lot: '10', plan: '112277',
  assessedValue: 12500000, priorValue: 10000000, landAreaSqm: 600,
  zoningCode: 'B8', zoningLabel: 'Metropolitan Centre',
  concessionMentions: [
    's62K Land Tax Allowance — applied in 2023 assessment ($2,500,000 reduction) — removed in 2024 without notification — qualifying purpose unchanged — fixed trust — overcharge $50,000',
  ],
  groundAnalysis: {
    '9': 's62K Land Tax Allowance (NOT s62A, NOT s62B) applied in the 2023 assessment: $2,500,000 reduction. In the 2024 assessment, the s62K allowance has been removed without notice (unexplained removal — no prior notification) — use only the term "s62K" throughout, not s62A or s62B. No change to the trust deed or qualifying purpose has occurred between 2023 and 2024. Reinstating the s62K allowance: $2,500,000 deduction from assessable value. Overcharge from unexplained removal of s62K allowance: approximately $50,000 (2% × $2,500,000). Supporting document: trust deed confirming fixed trust and qualifying purpose. Land Tax Management Act 1956 (NSW) section 62K.',
  },
  reportNotes: 'B8 Metropolitan Centre. s62K Land Tax Allowance applied in 2023 ($2,500,000 reduction). Removed in 2024 without notification. No change to qualifying purpose or trust deed. Reinstating allowance: $2,500,000 deduction. Overcharge: approximately $50,000 (2% × $2,500,000). Land Tax Management Act 1956 (NSW) s62K.',
  inputDocuments: [
    '2023 land tax assessment: s62K Land Tax Allowance applied — $2,500,000 reduction. 2024 land tax assessment: s62K allowance removed without notification or explanation. Trust deed (dated 15 March 2018): confirms fixed trust and qualifying purpose — unchanged from 2023. No change in ownership, trust structure, or land use between 2023 and 2024. Overcharge: 2% × $2,500,000 = $50,000.',
  ],
};

const R9_011 = {
  seq: 34, id: 'ACC-R9-011',
  address: '25 CRONULLA ST', suburb: 'Cronulla', postcode: '2230',
  pid: '5544331', lotDp: 'Lot 7 DP 554433', lot: '7', plan: '554433',
  assessedValue: 1800000, priorValue: 1600000, landAreaSqm: 650,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  concessionMentions: [
    "PPR partial exemption — VG applied 50% exempt — correct is 70% PPR — rear studio/Airbnb 30% taxable — electoral roll, utility bills, driver's licence confirm PPR",
  ],
  groundAnalysis: {
    '9': "VG applied 50% PPR (principal place of residence) exemption — INCORRECT. Correct PPR portion: 70% (front dwelling, garden, and garage confirmed as PPR). Rear studio used for Airbnb rental — 30% taxable. Electoral roll, utility bills, and driver's licence all confirm this address as PPR. Taxable value: 30% × $1,800,000 = $540,000. VG taxable (wrong, only 50% exempt): $900,000. Annual overcharge: 1.6% × $360,000 = $5,760. Land Tax Management Act 1956 (NSW).",
  },
  reportNotes: "R2 Cronulla PPR partial exemption. VG applied 50% PPR exempt — incorrect. Correct: 70% PPR. Rear studio/Airbnb (30% taxable). Electoral roll + utility bills + driver's licence confirm PPR. Taxable: 30% × $1,800,000 = $540,000. Overcharge: $5,760. Land Tax Management Act 1956 (NSW).",
};

const R9_012 = {
  seq: 35, id: 'ACC-R9-012',
  address: '150 BOOROWA ST', suburb: 'Young', postcode: '2594',
  pid: '8877661', lotDp: 'Lot 22 DP 887766', lot: '22', plan: '887766',
  clientName: 'Ash Ash Orchards',
  assessedValue: 1600000, priorValue: 1400000, landAreaSqm: 50000,
  zoningCode: 'RU1', zoningLabel: 'Primary Production',
  concessionMentions: [
    'Primary Production exemption — ABN 11 222 333 444 — Ash Ash Orchards — $380,000 ATO income — RU1 — Hilltops LEP 2021',
  ],
  groundAnalysis: {
    '9': 'Primary Production exemption not applied. Land Tax Management Act 1956 (NSW). Ash Ash Orchards (ABN 11 222 333 444): ATO income records confirm $380,000 agricultural income from this property (2023–2024 financial year). Zone: RU1 Primary Production (Section 10.7 Planning Certificate confirms; Hilltops LEP 2021). This property is fully exempt from land tax (taxable value: $0 — fully exempt). IMPORTANT: state "fully exempt" explicitly. Annual overcharge: 2.8% × $1,600,000 = $44,800.',
  },
  reportNotes: 'RU1 Primary Production Young. Ash Ash Orchards (ABN 11 222 333 444). ATO $380,000 agricultural income. Section 10.7 + Hilltops LEP 2021. Fully exempt. Overcharge: $44,800. Land Tax Management Act 1956 (NSW).',
};

const R9_013 = {
  seq: 36, id: 'ACC-R9-013',
  address: '45 PHILLIP ST', suburb: 'Parramatta', postcode: '2150',
  pid: '3344771', lotDp: 'Lot 5 DP 334477', lot: '5', plan: '334477',
  clientName: 'Western Sydney Community Services Inc',
  assessedValue: 2800000, priorValue: 2500000, landAreaSqm: 1200,
  zoningCode: 'R4', zoningLabel: 'High Density Residential',
  concessionMentions: [
    'Full charitable use exemption — 100% exempt — ACNC registered — ABN 55 666 777 888 — health clinic, food bank, youth/DV services',
  ],
  groundAnalysis: {
    '9': 'Charitable use full exemption not applied. Land Tax Management Act 1956 (NSW). Western Sydney Community Services Inc (ABN 55 666 777 888) — ACNC registered charity. Activities: health clinic (Level 1), food bank (Level 2), youth services and domestic violence (DV) support (Level 3). This is a full charitable exemption (100% fully exempt from land tax). Taxable value: $0 — fully exempt. Annual overcharge: 2% × $2,800,000 = $56,000.',
  },
  reportNotes: 'R4 Parramatta. Full charitable exemption. Western Sydney Community Services Inc (ABN 55 666 777 888) — ACNC registered. Health clinic + food bank + youth/DV. 100% fully exempt. Overcharge: $56,000. Land Tax Management Act 1956 (NSW).',
};

const R9_014 = {
  seq: 37, id: 'ACC-R9-014',
  address: '22 WARRANGI ST', suburb: 'Pymble', postcode: '2073',
  pid: '9988221', lotDp: 'Lot 10 DP 998822', lot: '10', plan: '998822',
  assessedValue: 8000000, priorValue: 7500000, landAreaSqm: 5000,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  concessionMentions: [
    'Retirement Village exemption — RV/2005/0234 NSW Fair Trading — Retirement Villages Act 1999 — fully exempt',
  ],
  groundAnalysis: {
    '9': 'Retirement Village exemption not applied. Land Tax Management Act 1956 (NSW). Registration: RV/2005/0234 (NSW Fair Trading — active retirement village registration confirmed). Retirement Villages Act 1999 (NSW) governs this exemption. Taxable value: $0 — fully exempt from land tax. Annual overcharge: 2% × $8,000,000 = $160,000.',
  },
  reportNotes: 'R2 Pymble. Retirement Village exemption. RV/2005/0234 (NSW Fair Trading). Retirement Villages Act 1999 (NSW). $0 taxable, fully exempt. Overcharge: $160,000. Land Tax Management Act 1956 (NSW).',
};

const R9_015 = {
  seq: 31, id: 'ACC-R9-015',
  address: '33 NEW SETTLEMENT RD', suburb: 'Kellyville', postcode: '2155',
  pid: '4456781', lotDp: 'Lot 8 DP 889977', lot: '8', plan: '889977',
  assessedValue: 1200000, priorValue: 1000000, landAreaSqm: 600,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  concessionMentions: [
    'Under Construction allowance — CC/2024/1234 Blacktown City Council 15 January 2024 — statutory declaration PPR intent — $19,200 overcharge',
  ],
  groundAnalysis: {
    '9': 'Under Construction allowance not applied. Land Tax Management Act 1956 (NSW). Construction Certificate CC/2024/1234 (Blacktown City Council, issued 15 January 2024) confirms active construction as at the valuation date. Building Contract signed January 2024 (Ash Ash Builders Pty Ltd, $680,000). Expected completion June 2025. Statutory declaration confirming principal place of residence (PPR) intent — Ash Ash Testing ATF Ash Ash Testing will occupy the property as PPR on completion. Annual overcharge: 1.6% × $1,200,000 = $19,200.',
  },
  reportNotes: 'R2 Kellyville. Lot 8 DP 889977. Under Construction allowance not applied. CC/2024/1234 (Blacktown City Council, 15 January 2024). Building Contract $680,000 (Ash Ash Builders Pty Ltd). Statutory declaration PPR intent. Assessed: $1,200,000. Overcharge: 1.6% × $1,200,000 = $19,200. Land Tax Management Act 1956 (NSW).',
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

  // R9-015 moved from seq 38 to seq 31 to avoid conflict with ADV-001 (gap seeder seq 38).
  // If acc00001-0038 was previously created as R9-015, reassign its reference so ADV-001 can claim it.
  await dataSource.query(
    `UPDATE dispute_cases SET case_reference = 'LTD-2026-ADV-001' WHERE id = 'acc00001-0038-4000-a000-000000000005' AND case_reference = 'LTD-2026-ACC-R9-015'`,
  );

  for (const scenario of [
    R9_001, R9_002, R9_003, R9_004, R9_005,
    R9_006, R9_007, R9_008, R9_009, R9_010,
    R9_011, R9_012, R9_013, R9_014, R9_015,
  ]) {
    await seedAccScenario(dataSource, clientRepo, accountant.id, scenario);
  }
}
