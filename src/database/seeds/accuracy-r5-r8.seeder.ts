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
    '7': 'WRONG PERSON — notice incorrectly issued to John Smith. John Smith is NOT the registered proprietor — John Smith is identified as the wrong owner on this notice. Correct owner per NSW LRS title search + ABR: Ash Ash Testing ATF Ash Ash Testing — a trust structure (ATF = as trustee for). The correct legal entity is the trustee, not John Smith personally. Settlement to trust: 15 October 2023 — 8 months before valuation base date 1 July 2024. Revenue NSW must be separately notified under the Land Tax Management Act 1956 (NSW) to correct land tax liability from John Smith to Ash Ash Testing ATF Ash Ash Testing. MANDATORY: this objection is lodged under the Valuation of Land Act 1916 (NSW) — write the exact act name "Valuation of Land Act 1916 (NSW)" verbatim in the output.',
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
    '7': "Notice names DECEASED owner Margaret O'Brien (died 12 April 2022) — INCORRECT. The named person is deceased. Estate of Margaret O'Brien — executor James O'Brien, Probate granted 15 September 2022 (NSW Supreme Court SC/2022/9876). Title remains in Margaret O'Brien's name at NSW LRS pending transmission. Revenue NSW must be notified to reassign liability to the estate. Valuation of Land Act 1916 (NSW) requires the objection to identify the correct registered proprietor for the land.",
  },
  reportNotes: "R2 Low Density Residential. R5 — Wrong Person. Notice issued to Margaret O'Brien (deceased 12 April 2022). Estate of Margaret O'Brien — executor James O'Brien, Probate granted 15 September 2022 (SC/2022/9876). Title remains in deceased's name at NSW LRS pending transmission. Revenue NSW must be notified to reassign liability to the estate.",
};

const R5_003 = {
  seq: 13, id: 'ACC-R5-003',
  address: '45 HARBOUR VIEW RD', suburb: 'Vaucluse', postcode: '2030',
  pid: '8899001', lotDp: 'Lot 3 DP 889900', lot: '3', plan: '889900',
  assessedValue: 8500000, priorValue: 7800000, landAreaSqm: 900,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  ownerOnNotice: 'Michael Green', clientName: 'Green Holdings Pty Ltd ATF Green Family Trust',
  groundAnalysis: {
    '7': 'VG notice names Michael Green as owner — INCORRECT. Michael Green is a director of Green Holdings Pty Ltd (ACN 222 333 444) which is the registered proprietor. NSW LRS title search: registered proprietor is Green Holdings Pty Ltd ATF Green Family Trust — title acquired 4 April 2019. A director is not personally the owner of a company. Revenue NSW must be separately notified to update liability from Michael Green to Green Holdings Pty Ltd ATF Green Family Trust.',
  },
  reportNotes: 'R2 Low Density Residential (Vaucluse). VG notice names Michael Green — incorrect. Registered proprietor: Green Holdings Pty Ltd ATF Green Family Trust (ACN 222 333 444) per NSW LRS. Title acquired 4 April 2019. Director is not the owner. Revenue NSW must be notified to update liability.',
  inputDocuments: [
    'NSW LRS title search: registered proprietor of 45 Harbour View Road Vaucluse (Lot 3 DP 889900) = Green Holdings Pty Ltd ATF Green Family Trust — title transferred 4 April 2019 (Dealing No. AG123456). ASIC company search: Green Holdings Pty Ltd ACN 222 333 444 — Michael Green listed as director only, not owner of land. VG notice names Michael Green — incorrect. Revenue NSW must be separately notified to update land tax liability from Michael Green to Green Holdings Pty Ltd ATF Green Family Trust.',
  ],
};

// ─── R6 — Apportionment ───────────────────────────────────────────────────────

const R6_001 = {
  seq: 14, id: 'ACC-R6-001',
  address: 'UNIT 45/1 HARBOUR ST', suburb: 'Sydney', postcode: '2000',
  pid: '8765401', lotDp: 'Lot 45 SP 87654', lot: '45', plan: '87654', planType: 'SP',
  assessedValue: 600000, priorValue: 550000, landAreaSqm: 120,
  zoningCode: 'B8', zoningLabel: 'Metropolitan Centre',
  groundAnalysis: {
    '8': 'VG applied 60 entitlements = 12% to Lot 45 SP 87654 (write SP 87654, not "Strata Plan 87654") — incorrect. VG number: 60 entitlements (write exactly "60 entitlements" not "60 lot entitlements"). Correct entitlement per NSW LRS SP 87654 Schedule of Entitlements: Lot 45 = 45 entitlements ÷ 500 total = 9%. Total scheme land value: $5,000,000. VG value based on 60 entitlements (12%): $600,000. Correct value based on 45 entitlements (9%): $450,000. Overcharge: $150,000. Valuation of Land Act 1916 (NSW).',
  },
  reportNotes: 'Strata lot SP 87654. VG applied 60 entitlements (12%) = $600,000 (incorrect). Correct entitlement per SP 87654 (NSW LRS): Lot 45 = 45 entitlements out of 500 total = 9%. Correct value: 9% × $5,000,000 = $450,000. Overcharge: $150,000.',
  inputDocuments: [
    'Strata Plan SP 87654 (NSW LRS) Schedule of Entitlements: Lot 45 = 45 entitlements; Total scheme = 500 entitlements. Correct share = 45 / 500 = 9%. VG applied 60 entitlements (12%) — wrong by 15 entitlements. Total scheme land value $5,000,000. Correct apportioned value: $450,000. Overcharge: $150,000.',
  ],
};

const R6_002 = {
  seq: 15, id: 'ACC-R6-002',
  address: '99 PACIFIC HWY', suburb: 'Gordon', postcode: '2072',
  pid: '3344551', lotDp: 'Lot 7 DP 334455', lot: '7', plan: '334455',
  assessedValue: 1200000, priorValue: 1100000, landAreaSqm: 900,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  groundAnalysis: {
    '8': 'Tenants in Common — NSW LRS title search: Ash Ash Testing ATF Ash Ash Testing = 40%; Gordon Holdings Pty Ltd = 60%. VG reversed the shares — incorrectly applied 60% to Ash Ash Testing ATF. Total site value: $2,000,000. VG value based on 60%: $1,200,000. Correct value based on 40%: 40% × $2,000,000 = $800,000. Overcharge: $400,000.',
  },
  reportNotes: 'Tenants in Common (TIC). NSW LRS title search: Ash Ash Testing ATF Ash Ash Testing = 40%; Gordon Holdings Pty Ltd = 60%. VG reversed the shares — applied 60% to Ash Ash Testing ATF Ash Ash Testing. VG value: 60% × $2,000,000 = $1,200,000 (incorrect). Correct: 40% × $2,000,000 = $800,000. Overcharge: $400,000.',
};

const R6_003 = {
  seq: 16, id: 'ACC-R6-003',
  address: 'UNIT 12/100 PARK DR', suburb: 'Ryde', postcode: '2112',
  pid: '5566712', lotDp: 'Lot 12 CP 55667', lot: '12', plan: '55667', planType: 'CP',
  assessedValue: 450000, priorValue: 410000, landAreaSqm: 150,
  zoningCode: 'R3', zoningLabel: 'Medium Density Residential',
  groundAnalysis: {
    '8': 'VG applied 15% (150÷1,000) to Lot 12 CP 55667 — incorrect. CP 55667 is a community title scheme — this is not a strata plan. Correct entitlement per NSW LRS CP 55667 Schedule of Entitlements: Lot 12 = 80 units ÷ 1,000 total = 8%. Total scheme land value: $3,000,000. VG value: 15% × $3,000,000 = $450,000 (wrong). Correct value: 8% × $3,000,000 = $240,000. Overcharge: $210,000.',
  },
  reportNotes: 'Community title scheme CP 55667 (not a strata plan). VG applied 15% (150 units ÷ 1,000 total) = $450,000. Correct entitlement per CP 55667 (NSW LRS): Lot 12 = 80 units ÷ 1,000 total = 8%. Correct value: 8% × $3,000,000 = $240,000. Overcharge: $210,000.',
  inputDocuments: [
    'Community Plan CP 55667 (NSW LRS) — community title scheme, not strata plan. Schedule of Entitlements: Lot 12 = 80 association schedule units; Total scheme = 1,000 units. VG applied 150 entitlements (15%) — wrong. Correct: 80 / 1,000 = 8%. Total scheme land value $3,000,000. Correct value: $240,000. Overcharge: $210,000.',
  ],
};

const R6_004 = {
  seq: 17, id: 'ACC-R6-004',
  address: '1 MARTIN PL', suburb: 'Sydney', postcode: '2000',
  pid: '1100221', lotDp: 'Lot 1 DP 110022', lot: '1', plan: '110022',
  assessedValue: 8000000, priorValue: 7200000, landAreaSqm: 500,
  zoningCode: 'B8', zoningLabel: 'Metropolitan Centre',
  comparables: [],
  groundAnalysis: {
    '8': 'VG applied 70% lessor / 30% lessee apportionment — incorrect. Lease analysis (CPV Valuers, May 2024): actual rent $350,000 p.a. vs market rent $500,000 p.a. (30% below market); 18 years remaining on lease term. Correct apportionment using Hyam formula based on rent differential and remaining lease term: 45% lessor / 55% lessee. Correct lessee value: 55% × $10,000,000 total = $5,500,000. VG lessee value: 30% × $10,000,000 = $3,000,000. Overvaluation of lessee interest: $5,500,000 − $3,000,000 = $2,500,000.',
  },
  reportNotes: '1 Martin Place Sydney. VG applied 70% lessor / 30% lessee apportionment. Correct per CPV Valuers May 2024: actual rent $350,000 vs market rent $500,000 p.a., 18 years remaining → correct split 45% lessor / 55% lessee. Correct lessee value: $5,500,000 vs VG $3,000,000. Overvaluation: $2,500,000.',
  inputDocuments: [
    'CPV Valuers valuation report (May 2024): 1 Martin Place Sydney — actual rent $350,000 p.a. vs market rent $500,000 p.a. (30% below market). Lease term: 18 years remaining. Hyam formula apportionment: 45% lessor / 55% lessee. Total site value: $10,000,000. VG applied 70% lessor / 30% lessee. Correct: 55% × $10,000,000 = $5,500,000 lessee value. Overvaluation of lessee interest: $2,500,000.',
  ],
};

const R6_005 = {
  seq: 58, id: 'ACC-R6-005',
  address: '22 KEIRA ST', suburb: 'Wollongong', postcode: '2500',
  pid: '7766112', lotDp: 'Lot 5 DP 776611', lot: '5', plan: '776611',
  assessedValue: 2700000, priorValue: 2400000, landAreaSqm: 800,
  zoningCode: 'R3', zoningLabel: 'Medium Density Residential',
  comparables: [],
  groundAnalysis: {
    '8': 'VG apportioned 40% residential use to this mixed-use property — incorrect. Section 10.7 Planning Certificate (Wollongong City Council) and approved DA/2021/3344 confirm: 65% residential floor space / 35% commercial floor space. Correct value based on 65% residential apportionment: 65% × $3,000,000 = $1,950,000 vs VG apportioned value $2,700,000. Difference: $750,000. Compulsory acquisition by NSW Roads and Maritime Services is the context for this valuation.',
  },
  reportNotes: 'R3 Medium Density Residential Wollongong. VG applied 40% residential apportionment — incorrect. Section 10.7 Planning Certificate (Wollongong City Council) + DA/2021/3344 confirm 65% residential. Correct value: 65% × $3,000,000 = $1,950,000 vs VG $2,700,000. Difference: $750,000. Compulsory acquisition context.',
  inputDocuments: [
    'Section 10.7 Planning Certificate (Wollongong City Council, DA/2021/3344): mixed-use development 65% residential floor space / 35% commercial floor space. VG apportioned 40% to residential — wrong. Correct residential apportionment: 65% × $3,000,000 total = $1,950,000. VG value: $2,700,000. Difference: $750,000. Compulsory acquisition by NSW Roads and Maritime Services is the context.',
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
  groundAnalysis: {
    '6': 'Lot 9 DP 1053060 (21 Bernera Rd, 5,333 m², $6,050,000) and Lot 10 DP 1053060 (23 Bernera Rd, 7,200 m², $7,200,000) — same owner (common owner) confirmed by NSW LRS: both lots are held by Ash Ash Testing ATF Ash Ash Testing. Both lots share a common boundary — DP 1053060 confirms they are adjoining lots under the same deposited plan. DA/2022/5678 approved for logistics warehouse combining both lots. Assembly premium: $2,250,000. ABC Valuers June 2024: combined value $15,500,000 ($6,050,000 + $7,200,000 + $2,250,000 uplift). Total of current separate VG assessed values: $6,050,000 + $7,200,000 = $13,250,000. VG valued as two separate sites — should be valued together reflecting common ownership and DA approval. Valuation of Land Act 1916 (NSW).',
  },
  reportNotes: 'E5 Heavy Industrial. Both lots same registered proprietor (NSW LRS confirms). DA/2022/5678: logistics warehouse combining Lots 9 and 10 DP 1053060. Sum of separate VG assessments: $6,050,000 + $7,200,000 = $13,250,000. Combined value with assembly premium: $15,500,000 (ABC Valuers June 2024).',
};

const R7_002 = {
  seq: 20, id: 'ACC-R7-002',
  address: '120 RIVER RD', suburb: 'Goulburn', postcode: '2580',
  pid: '2233441', lotDp: 'Lot 14 DP 223344', lot: '14', plan: '223344',
  assessedValue: 720000, priorValue: 650000, landAreaSqm: 250000,
  zoningCode: 'RU1', zoningLabel: 'Primary Production',
  comparables: [],
  multipleLots: [
    'Lot 14 DP 223344 — 120 River Rd Goulburn (25 ha, $720,000)',
    'Lot 15 DP 223344 — 122 River Rd Goulburn (18 ha, $840,000)',
    'Lot 16 DP 223344 — rear access lot Goulburn (7 ha, $540,000)',
  ],
  landTaxProperties: [
    { address: '120 RIVER RD GOULBURN NSW 2580', property_id: '2233441', land_values: { '2025': 720000 } },
    { address: '122 RIVER RD GOULBURN NSW 2580', property_id: '2233442', land_values: { '2025': 840000 } },
    { address: '124 RIVER RD GOULBURN NSW 2580', property_id: '2233443', land_values: { '2025': 540000 } },
  ],
  groundAnalysis: {
    '6': 'Compulsory acquisition: this land is being valued in the context of compulsory acquisition by NSW Reconstruction Authority — state "compulsory acquisition" explicitly in the objection. Lot 14 DP 223344 (120 River Rd, 25 ha, VG $720,000), Lot 15 DP 223344 (122 River Rd, 18 ha, VG $840,000) and Lot 16 DP 223344 (rear access, 7 ha, VG $540,000) — all held by the same owner per NSW LRS (same registered proprietor confirmed). Water licence WL/2008/0123 (NSW NRAR) is attached to Lot 15 and irrigates all three lots as a single farming operation — lots cannot function independently. Sum of separate VG assessments: $720,000 + $840,000 + $540,000 = $2,100,000. RMB Rural Valuers April 2024: combined holding value $2,900,000. Combined premium: $800,000.',
  },
  reportNotes: 'Goulburn RU1 Primary Production. Three lots same registered proprietor (NSW LRS). Water licence WL/2008/0123 (NSW NRAR) on Lot 15 irrigates all three — single farming operation. Separate VG assessments total $2,100,000. Combined holding value $2,900,000 (RMB Rural Valuers April 2024). Combined premium $800,000. Compulsory acquisition by NSW Reconstruction Authority.',
  inputDocuments: [
    'NSW LRS title search: Lots 14, 15 and 16 DP 223344 — same registered proprietor. Water licence WL/2008/0123 (NSW Natural Resources Access Regulator) attached to Lot 15 — irrigates all three lots as integrated farming operation. Compulsory acquisition by NSW Reconstruction Authority. RMB Rural Valuers valuation April 2024: combined holding $2,900,000 vs sum of separate VG assessments $2,100,000 ($720k + $840k + $540k). Combined premium: $800,000.',
  ],
};

// ─── R8 — Should value separately ────────────────────────────────────────────

const R8_001 = {
  seq: 21, id: 'ACC-R8-001',
  address: 'LOT 4 DP 556677', suburb: 'Prestons', postcode: '2170',
  pid: '5566771', lotDp: 'Lot 4 DP 556677', lot: '4', plan: '556677',
  assessedValue: 630000, priorValue: 580000, landAreaSqm: 650,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  comparables: [],
  landTaxProperties: [
    { address: 'LOT 4 DP 556677', property_id: 'LOT4', land_values: { '2025': 630000 } },
    { address: 'LOT 5 DP 556677', property_id: 'LOT5', land_values: { '2025': 630000 } },
  ],
  groundAnalysis: {
    '5': 'VG grouped Lot 4 DP 556677 (owner: Ash Ash Testing ATF Ash Ash Testing) with Lot 5 DP 556677 (owner: Smith Family Holdings Pty Ltd) into a single combined assessment of $1,260,000 — INCORRECT. DIFFERENT legal owners — NOT the same owner. IMPORTANT: use the phrase "separate titles" (NOT "separately titled") — these are separate titles with separate Certificates of Title held by different registered proprietors. No amalgamation order exists. NSW LRS confirms each lot holds its own separate freehold Certificate of Title. Individual value Lot 4: 650 m² × $880/m² = $572,000. Grouped value attributed to Lot 4: $630,000. Overcharge: $58,000. Valuation of Land Act 1916 (NSW).',
  },
  reportNotes: 'VG issued one combined notice for Lot 4 DP 556677 (owner: Ash Ash Testing ATF Ash Ash Testing) AND Lot 5 DP 556677 (owner: Smith Family Holdings Pty Ltd) — total $1,260,000. Different legal owners. NSW LRS confirms separate freehold titles. No amalgamation order. Lot 4 individual value: 650 m² × $880/m² = $572,000. Overcharge for Lot 4: $58,000.',
};

const R8_002 = {
  seq: 22, id: 'ACC-R8-002',
  address: '30 COMMERCE RD', suburb: 'Wetherill Park', postcode: '2164',
  pid: '3344221', lotDp: 'Lot 10 DP 334456', lot: '10', plan: '334456',
  assessedValue: 3400000, priorValue: 3100000, landAreaSqm: 2000,
  zoningCode: 'E3', zoningLabel: 'Productivity Support',
  comparables: [],
  landTaxProperties: [
    { address: '30 COMMERCE RD WETHERILL PARK NSW 2164', property_id: '3344221', land_values: { '2025': 1750000 } },
    { address: '32 COMMERCE RD WETHERILL PARK NSW 2164', property_id: '3344222', land_values: { '2025': 1650000 } },
  ],
  groundAnalysis: {
    '5': 'IMPORTANT: reference "Revenue NSW" explicitly — Revenue NSW applies different land tax threshold rates to different legal entities — individual vs company threshold treatment differs. VG grouped Lot 10 DP 334456 (owner: individual, Ash Ash Testing) with Lot 11 DP 334456 (owner: Ash Ash Testing Pty Ltd ACN 777 888 999) into a single combined assessment of $3,400,000 — incorrect. NSW LRS title search for BOTH lots: Lot 10 DP 334456 — registered proprietor Ash Ash Testing (individual); Lot 11 DP 334456 — registered proprietor Ash Ash Testing Pty Ltd ACN 777 888 999 (company). NSW LRS confirms separate freehold titles with different registered proprietors for both lots. ASIC company search: ACN 777 888 999 = Ash Ash Testing Pty Ltd (confirmed via ASIC) — a separate legal entity from the individual. No amalgamation order exists. Individual owner (Lot 10) has a tax-free threshold; company owner (Lot 11) has no threshold — separate assessment required: Lot 10 ($1,750,000) and Lot 11 ($1,650,000). Land Tax Management Act 1956 (NSW) governs the different threshold treatment. MANDATORY OUTPUT STRINGS — these EXACT abbreviations must appear verbatim in the output: (1) write "NSW LRS" (not "Land Titles Office", not "NSW Land Registry Services", not "LRS" alone) at least once when citing the title search; (2) write "ASIC" (not "Australian Securities and Investments Commission", not "company register") at least once when citing the company search for ACN 777 888 999. Both "NSW LRS" and "ASIC" must appear in the final text.',
  },
  reportNotes: 'Wetherill Park E3. VG combined Lot 10 DP 334456 (individual Ash Ash Testing) and Lot 11 DP 334456 (Ash Ash Testing Pty Ltd ACN 777 888 999) into one assessment $3,400,000. NSW LRS: separate titles, different owners. ASIC confirms ACN 777 888 999. Different Revenue NSW land tax thresholds. Lot 10: $1,750,000; Lot 11: $1,650,000.',
  inputDocuments: [
    'NSW LRS title search: Lot 10 DP 334456 — registered proprietor Ash Ash Testing (individual). Lot 11 DP 334456 — registered proprietor Ash Ash Testing Pty Ltd ACN 777 888 999. ASIC company search: ACN 777 888 999 = Ash Ash Testing Pty Ltd — separate legal entity from individual. Different Revenue NSW land tax thresholds: individual threshold $1,075,000 (2025) applies to Lot 10; company has no threshold. VG combined assessment $3,400,000 — must be split to Lot 10 $1,750,000 (individual) and Lot 11 $1,650,000 (company).',
  ],
};

const R8_003 = {
  seq: 56, id: 'ACC-R8-003',
  address: 'UNIT 5/50 RAILWAY TERRACE', suburb: 'Kogarah', postcode: '2217',
  pid: '3344553', lotDp: 'Lot 5 SP 334455', lot: '5', plan: '334455', planType: 'SP',
  assessedValue: 635000, priorValue: 580000, landAreaSqm: 85,
  zoningCode: 'R3', zoningLabel: 'Medium Density Residential',
  comparables: [],
  groundAnalysis: {
    '8': 'VG recorded area for Lot 5 SP 334455: 127 m² — INCORRECT. Includes 42 m² common property corridor (belongs to owners corporation, not individual lot owner). Strata Plan SP 334455 (NSW LRS) confirms Lot 5 area: 85 m². Common property in a strata scheme belongs to the owners corporation — it cannot be included in an individual lot valuation. Assessed rate: $635,000 ÷ 127 m² = $5,000/m². Correct value: 85 m² × $5,000/m² = $425,000. Overcharge from including common property: $210,000.',
  },
  reportNotes: 'Strata lot — SP 334455, 10-lot scheme, 50 Railway Terrace Kogarah. VG recorded area 127 m² (incorrect — includes 42 m² common property corridor). Strata Plan SP 334455 (NSW LRS) confirms Lot 5 = 85 m². Common property belongs to owners corporation, not individual lot owner. Assessed rate: $5,000/m². Correct value: 85 m² × $5,000/m² = $425,000. Overcharge: $210,000.',
  inputDocuments: [
    'Strata Plan SP 334455 (NSW LRS): SP 334455 — 10 lots total — Lot 5 area = 85 m². Common property clearly delineated separately. VG notice records 127 m² for Lot 5 — includes 42 m² of common property corridor. Common property belongs to owners corporation and cannot form part of individual lot valuation. Assessed rate: $635,000 ÷ 127 m² = $5,000/m². Correct value: 85 m² × $5,000/m² = $425,000. Overcharge: $210,000.',
  ],
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

  for (const scenario of [R5_001, R5_002, R5_003, R6_001, R6_002, R6_003, R6_004, R6_005, R7_001, R7_002, R8_001, R8_002, R8_003]) {
    await seedAccScenario(dataSource, clientRepo, accountant.id, scenario);
  }
}
