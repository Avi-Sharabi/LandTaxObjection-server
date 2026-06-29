import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from 'src/api/users/entities/user.entity';
import { Client } from 'src/api/clients/entities/client.entity';
import { seedAccScenario } from './accuracy-r1-r4.seeder';

/**
 * Accuracy test seeders — Gap scenarios (ADV/CRX/MIS/INV/R1X/R2X).
 * Sequences 38–50 (UUIDs: acc00001-00NN-4000-a000-000000000TTT).
 */

const logger = new Logger('AccuracyTestSeeder');
const ACCOUNTANT_EMAIL = 'april.clemente@ymlgroup.com.au';
const DEFAULT_CLIENT = 'Ash Ash Testing ATF Ash Ash Testing';

// ─── ADV — Adversarial ────────────────────────────────────────────────────────

const ADV_001 = {
  seq: 38, id: 'ADV-001',
  address: '18 HARBOUR VIEW TCE', suburb: 'Balmain', postcode: '2041',
  pid: '1502333', lotDp: 'Lot 4 DP 556612', lot: '4', plan: '556612',
  assessedValue: 1800000, priorValue: 1620000, landAreaSqm: 350,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  comparables: [
    { address: '22 HARBOUR VIEW TCE BALMAIN NSW 2041', area_m2: 340, zone: 'R2', analysed_land_value: 2108000, rate_per_m2: 6200, contract_date: '2024-04-01' },
    { address: '9 FITZROY ST BALMAIN NSW 2041', area_m2: 360, zone: 'R2', analysed_land_value: 2268000, rate_per_m2: 6300, contract_date: '2024-02-01' },
    { address: '31 DARLING ST BALMAIN NSW 2041', area_m2: 345, zone: 'R2', analysed_land_value: 2139000, rate_per_m2: 6200, contract_date: '2024-05-01' },
  ],
  groundAnalysis: {
    '2': 'ASSESSED VALUE TOO LOW. Assessed $1,800,000 ($5,143/m²). Three comparable sales average $6,233/m². VG used inferior non-waterfront sales at $5,100/m². Argued higher value: $6,233/m² × 350 m² = $2,182,000. FINANCIAL WARNING: higher assessed value will increase land tax liability — accounting advice required.',
    '7': 'ABR: owner correctly named as Ash Ash Testing ATF Ash Ash Testing. No wrong-person issue. R5 must NOT be ticked.',
    '9': 'No concession applies to this property. No contamination, no heritage, no SEPP, no stratum, no subdivider intent, no coal, no attributable part. R9 must NOT be ticked.',
  },
  reportNotes: "R2 Low Density Residential. Area 350 m2. ASSESSED VALUE IS BELOW MARKET (R2 — Too Low). Assessed $1,800,000 ($5,143/m2). Three comparable sales average $6,233/m2. VG used inferior non-waterfront sales at $5,100/m2. Argued higher value: $6,233/m2 * 350 m2 = $2,182,000. FINANCIAL WARNING: higher assessed value will increase land tax liability — accounting advice required. NO concessions, NO heritage, NO SEPP overlays, NO PPR flag, NO trust structure — R9 must NOT be ticked.",
};

const ADV_002 = {
  seq: 39, id: 'ADV-002',
  address: '9 OLEANDER DR', suburb: 'Castle Hill', postcode: '2154',
  pid: '7712341', lotDp: 'Lot 7 DP 771234', lot: '7', plan: '771234',
  assessedValue: 2400000, priorValue: 2150000, landAreaSqm: 900,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  comparables: [
    { address: '14 OLEANDER DR CASTLE HILL NSW 2154', area_m2: 880, zone: 'R2', analysed_land_value: 2090000, rate_per_m2: 2375, contract_date: '2024-03-01' },
    { address: '5 OLEANDER DR CASTLE HILL NSW 2154', area_m2: 920, zone: 'R2', analysed_land_value: 2185000, rate_per_m2: 2375, contract_date: '2024-01-01' },
    { address: '22 BAULKHAM HILLS RD CASTLE HILL NSW 2154', area_m2: 910, zone: 'R2', analysed_land_value: 2162000, rate_per_m2: 2376, contract_date: '2024-04-01' },
  ],
  groundAnalysis: {
    '1': 'Assessed $2,400,000 ($2,667/m²). High voltage easement: rear 150 m² sterilised — -8% adjustment. Comparable average $2,375/m². Combined adjustment: -8% easement + market rate adjustment. Argued lower value: $2,375/m² × 92% = $2,185/m² × 900 m² = $1,966,500 vs assessed $2,400,000. Overvaluation: $433,500.',
    '9': 'PPR flag is set in the system. However NO supporting evidence is attached — no statutory declaration, no council rates notice, no occupancy confirmation. PPR exemption cannot be applied on the basis of a flag alone. AI must explicitly flag that PPR evidence is missing and request it. AI must NOT apply any PPR reduction to taxable value.',
  },
  reportNotes: "R2 Low Density Residential (Hills Local LEP 2012). Area 900 m2. Assessed $2,400,000 ($2,667/m2). Comparable average $2,375/m2. High voltage easement: rear 150 m2 sterilised — -8% adjustment. Argued lower value: $2,375/m2 * 92% = $2,185/m2 * 900 m2 = $1,966,500. PPR FLAG SET IN SYSTEM BUT NO SUPPORTING EVIDENCE ATTACHED — no statutory declaration, no occupancy confirmation, no rate notice. AI must explicitly note PPR exemption cannot be applied without evidence and must request evidence. AI must NOT silently apply PPR reduction.",
};

const ADV_003 = {
  seq: 40, id: 'ADV-003',
  address: 'SUITE 4/100 GEORGE ST', suburb: 'Parramatta', postcode: '2150',
  pid: '8844101', lotDp: 'Lot 4 SP 88441', lot: '4', plan: '88441', planType: 'SP',
  assessedValue: 2200000, priorValue: 2000000, landAreaSqm: 120,
  zoningCode: 'B3', zoningLabel: 'Commercial Core',
  groundAnalysis: {
    '8': 'CONFLICTING ENTITLEMENT SCHEDULES — cannot resolve without adjudication. Schedule A (2019 registration): Lot 4 = 9 units / 500 total = 9% → $198,000. Schedule B (2022 by-law amendment): Lot 4 = 12 units / 500 total = 12% → $264,000. VG applied Schedule B (12%) without documented basis. Conflict unresolved — no resolution document or adjudication exists. AI must identify BOTH schedules, flag the conflict, and explicitly state that a complete objection cannot be prepared until the conflict is resolved. Conditional overcharge if 9% is correct: $66,000.',
  },
  reportNotes: "Strata lot SP 88441, 50 lots. CONFLICTING ENTITLEMENT SCHEDULES — Schedule A (2019 registration): Lot 4 = 9 units out of 500 total = 9% -> $198,000. Schedule B (2022 by-law amendment): Lot 4 = 12 units out of 500 total = 12% -> $264,000. VG applied 12% (Schedule B) without documented basis. Conflict is unresolved — no resolution document or adjudication available. AI must identify BOTH schedules, must NOT silently select either, must NOT produce a complete R6 objection, must flag the conflict and request resolution. 60-day deadline still applies.",
  inputDocuments: [
    'Schedule A (2019 strata plan registration): Lot 4 entitlement = 9 units / 500 total = 9%. Schedule B (2022 by-law amendment): Lot 4 entitlement = 12 units / 500 total = 12%. Both schedules currently active in system. No resolution document or adjudication exists. VG applied 12% without documented basis. Conflict must be resolved before a complete R6 objection can be prepared. Potential overcharge if 9% is correct: $264,000 - $198,000 = $66,000 (conditional on resolution).',
  ],
};

// ─── CRX — Cross-Reason ───────────────────────────────────────────────────────

const CRX_001 = {
  seq: 41, id: 'CRX-001',
  address: '88 QUARRY RD', suburb: 'Erskine Park', postcode: '2759',
  pid: '6677441', lotDp: 'Lot 3 DP 667744', lot: '3', plan: '667744',
  assessedValue: 7560000, priorValue: 6800000, landAreaSqm: 7200,
  zoningCode: 'E4', zoningLabel: 'General Industrial',
  comparables: [
    { address: '76 QUARRY RD ERSKINE PARK NSW 2759', area_m2: 7100, zone: 'E4', analysed_land_value: 5893000, rate_per_m2: 830, contract_date: '2024-02-01' },
    { address: '95 LINKS RD ERSKINE PARK NSW 2759', area_m2: 7300, zone: 'E4', analysed_land_value: 6059000, rate_per_m2: 830, contract_date: '2024-04-01' },
    { address: '62 STURT RD ERSKINE PARK NSW 2759', area_m2: 7000, zone: 'E4', analysed_land_value: 5810000, rate_per_m2: 830, contract_date: '2023-12-01' },
  ],
  groundAnalysis: {
    '1': 'VG rate even at correct area 7,200 m²: $7,560,000 ÷ 7,200 m² = $1,050/m² — above E4 market. Three E4 Erskine Park comparable sales average $830/m². Argued lower value: $830/m² × 7,200 m² = $5,976,000 vs assessed $7,560,000. Overassessment at correct area: $1,584,000. Both Ground 1 (value too high) and Ground 3 (area incorrect) apply.',
    '3': 'VG recorded area 8,400 m² — WRONG. Correct area per Deposited Plan DP 667744 (NSW LRS title search): 7,200 m². Area overstated 1,200 m². Both Ground 3 (area incorrect) and Ground 1 (value too high even at correct area) apply.',
  },
  reportNotes: 'E4 General Industrial (Penrith LEP 2010). BOTH R3 AND R1 APPLY. R3: VG recorded area 8,400 m2 — WRONG. Correct area per DP 667744 title search: 7,200 m2. Area overstated 1,200 m2. R1: Even at correct area 7,200 m2, implied rate $7,560,000 / 7,200 = $1,050/m2 EXCEEDS market. Three E4 Erskine Park comparables average $830/m2. Combined correct value: $830/m2 * 7,200 m2 = $5,976,000. Total overassessment: $7,560,000 - $5,976,000 = $1,584,000. Title search + 3 comparable sales both cited.',
  inputDocuments: [
    'Current title search (DP 667744): Lot 3 area = 7,200 m2 (correct). VG recorded 8,400 m2 — overstated 1,200 m2. VG rate even at correct area: $7,560,000 / 7,200 m2 = $1,050/m2 — above market. Both R3 and R1 must be argued.',
  ],
};

const CRX_002 = {
  seq: 42, id: 'CRX-002',
  address: 'UNIT 11/55 RAILWAY PDE', suburb: 'Burwood', postcode: '2134',
  pid: '9920111', lotDp: 'Lot 11 SP 99201', lot: '11', plan: '99201', planType: 'SP',
  assessedValue: 178125, priorValue: 160000, landAreaSqm: 80,
  zoningCode: 'R3', zoningLabel: 'Medium Density Residential',
  ownerOnNotice: 'John Smith', clientName: 'Burwood Unit Trust No. 11 ATF Burwood Investments',
  entityClientName: 'Burwood Unit Trust No. 11 ATF Burwood Investments',
  groundAnalysis: {
    '7': 'Notice to John Smith — previous owner. Transfer: Burwood Unit Trust No. 11 ATF Burwood Investments, 8 October 2023.',
    '8': 'VG applied lot count (15 lots / 80 lots = 18.75%) — incorrect. Correct basis: entitlement units. SP 99201 Schedule of Entitlements: Lot 11 = 12 units / 800 total = 1.5%. Total scheme land value: $950,000. VG value: 18.75% × $950,000 = $178,125. Correct value: 1.5% × $950,000 = $14,250. Overcharge: $163,875.',
  },
  reportNotes: "BOTH R5 AND R6 APPLY. R5: Notice issued to John Smith (previous individual owner, sold September 2023). Correct current owner: Burwood Unit Trust No. 11 ATF Burwood Investments (registered transfer 8 October 2023). R6: VG entitlement error — applied 15 / 80 (lots, not entitlements) = 18.75% = $178,125. Correct: 12 / 800 (entitlement units) = 1.5% * $950,000 = $14,250. Overcharge: $178,125 - $14,250 = $163,875.",
};

const CRX_003 = {
  seq: 43, id: 'CRX-003',
  address: '14 HOXTON PARK RD', suburb: 'Prestons', postcode: '2170',
  pid: '8822111', lotDp: 'Lot 2 DP 882211', lot: '2', plan: '882211',
  assessedValue: 4200000, priorValue: 3800000, landAreaSqm: 4800,
  zoningCode: 'E5', zoningLabel: 'Heavy Industrial',
  comparables: [
    { address: '10 HOXTON PARK RD PRESTONS NSW 2170', area_m2: 4700, zone: 'E5', analysed_land_value: 2820000, rate_per_m2: 600, contract_date: '2024-03-01' },
    { address: '22 ORANGE GROVE RD PRESTONS NSW 2170', area_m2: 5000, zone: 'E5', analysed_land_value: 3000000, rate_per_m2: 600, contract_date: '2024-05-01' },
    { address: '8 BERNERA RD PRESTONS NSW 2170', area_m2: 4900, zone: 'E5', analysed_land_value: 2940000, rate_per_m2: 600, contract_date: '2024-01-01' },
  ],
  groundAnalysis: {
    '1': 'VG used B2 Local Centre retail comparable sales averaging $875/m² — entirely inappropriate for an E5 Heavy Industrial site. Correct E5 comparable sales (Prestons/Hoxton Park) average $600/m². Argued lower value: $600/m² × 4,800 m² = $2,880,000 vs assessed $4,200,000. Overassessment at correct zone comparables: $1,320,000. Both Ground 4 (zone description incorrect) and Ground 1 (value too high) apply.',
    '4': 'VG recorded zone B2 Local Centre — WRONG. Section 10.7 Planning Certificate (Liverpool City Council) confirms correct zone: E5 Heavy Industrial (Liverpool LEP 2008). VG used inapplicable B2 retail comparables. Both Ground 4 (zone description incorrect) and Ground 1 (value too high) apply.',
  },
  reportNotes: 'BOTH R4 AND R1 APPLY. R4: VG recorded zone B2 Local Centre — WRONG. Correct zone: E5 Heavy Industrial (Liverpool LEP 2008) — confirmed Section 10.7. R1: VG used B2 retail comparables averaging $875/m2 — inappropriate for E5 industrial. Correct E5 comparables average $600/m2. Combined correct value: $600/m2 * 4,800 m2 = $2,880,000. Overassessment: $4,200,000 - $2,880,000 = $1,320,000.',
  inputDocuments: [
    'Section 10.7 Planning Certificate (Liverpool City Council): E5 Heavy Industrial — Liverpool LEP 2008. VG notice records B2 Local Centre — incorrect. VG B2 retail comparables avg $875/m2 — entirely inappropriate for E5 industrial. E5 comparables avg $600/m2. Both R4 and R1 must be argued.',
  ],
};

// ─── MIS — Missing Data ───────────────────────────────────────────────────────

const MIS_001 = {
  seq: 44, id: 'MIS-001',
  address: '40 VICTORIA RD', suburb: 'Drummoyne', postcode: '2047',
  pid: '3344561', lotDp: 'Lot 5 DP 334456', lot: '5', plan: '334456',
  assessedValue: 3100000, priorValue: 2800000, landAreaSqm: 0,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  comparables: [
    { address: '38 VICTORIA RD DRUMMOYNE NSW 2047', area_m2: 650, zone: 'R2', analysed_land_value: 2860000, rate_per_m2: 4400, contract_date: '2024-03-01' },
    { address: '44 VICTORIA RD DRUMMOYNE NSW 2047', area_m2: 660, zone: 'R2', analysed_land_value: 2904000, rate_per_m2: 4400, contract_date: '2024-01-01' },
    { address: '50 VICTORIA RD DRUMMOYNE NSW 2047', area_m2: 640, zone: 'R2', analysed_land_value: 2816000, rate_per_m2: 4400, contract_date: '2024-04-01' },
  ],
  groundAnalysis: {
    '1': 'LAND AREA FIELD IS NULL — MISSING DATA. Land area is not recorded in the VG assessment database. Land area is required to calculate the $/m² rate and the argued land value. DO NOT use a comparable sale\'s lot area as a proxy estimate. Request the cadastral area from the current title search or the relevant deposited plan before completing this objection. Rear right-of-way easement recorded: -7% adjustment applicable once area is confirmed. Comparable sales at $4,400/m² are available but cannot be applied without confirmed land area.',
  },
  reportNotes: 'R2 Low Density Residential (Canada Bay LEP 2013). LAND AREA FIELD IS NULL — MISSING DATA. AI must identify that land area is not recorded and is required to calculate $/m2 rate and argued value. AI must NOT use a comparable lot area as a proxy estimate. AI must request cadastral area from current title or deposited plan. Rear right-of-way easement recorded: -7% adjustment. Comparable sales at $4,400/m2 are available but cannot be applied without land area.',
};

const MIS_002 = {
  seq: 45, id: 'MIS-002',
  address: '77 NEWBRIDGE RD', suburb: 'Moorebank', postcode: '2170',
  pid: '4411991', lotDp: 'Lot 12 DP 441199', lot: '12', plan: '441199',
  assessedValue: 4500000, priorValue: 4100000, landAreaSqm: 2000,
  zoningCode: 'E5', zoningLabel: 'Heavy Industrial',
  concessionMentions: [
    's14L(1)(A) Onsite Allowance — FLAG IS ACTIVE in system — SEPP No 55 contamination overlay confirmed — BUT REMEDIATION COST FIELD IS BLANK/NULL — XYZ Environmental Report (April 2024) attached as evidence document but cost not extracted to database field',
  ],
  groundAnalysis: {
    '9': 's14L(1)(A) Onsite Allowance — flag is ACTIVE but has not been applied. SEPP No 55 contamination overlay confirmed. HOWEVER: remediation cost field is BLANK — no dollar amount recorded. XYZ Environmental Engineering Report (April 2024) is attached as evidence but the cost figure has not been extracted into the database. AI must identify s14L(1)(A) under Land Tax Management Act 1956 (NSW) as the applicable concession and SEPP No 55 as the overlay. AI must NOT calculate taxable value or overcharge without the cost figure. AI must explicitly state the remediation cost is missing and request it be extracted from the XYZ report.',
  },
  reportNotes: 'E5 Heavy Industrial. s14L(1)(A) Onsite Allowance flag is ACTIVE. SEPP No 55 contamination confirmed. HOWEVER: Remediation cost field is BLANK — no dollar amount recorded. XYZ Environmental Engineering Report (April 2024) is attached as evidence but the cost figure has not been extracted into the database. AI must identify s14L(1)(A) as the applicable concession and SEPP No 55 as the overlay, but must NOT calculate taxable value or overcharge without the cost figure. AI must explicitly state the remediation cost is missing and request it to be extracted from the XYZ report. AI must NOT estimate the cost.',
};

const MIS_003 = {
  seq: 46, id: 'MIS-003',
  address: '6 CLEMATIS ST', suburb: 'Cherrybrook', postcode: '2126',
  pid: '2299441', lotDp: 'Lot 9 DP 229944', lot: '9', plan: '229944',
  assessedValue: 1950000, priorValue: 1750000, landAreaSqm: 700,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  ownerOnNotice: 'Margaret Collins', clientName: 'Thomas Collins (Administrator, Estate of Margaret Collins)',
  groundAnalysis: {
    '7': 'Notice to Margaret Collins (deceased). Date of death: NOT RECORDED — BLANK. Administrator: Thomas Collins — NSW Supreme Court grant of administration attached. AI must flag missing date of death and request death certificate. AI must NOT invent any date.',
  },
  reportNotes: 'R2 Low Density Residential (Hornsby LEP 2013). R5 — Wrong Person. Notice issued to Margaret Collins (deceased). DATE OF DEATH IS NOT RECORDED — FIELD IS BLANK/NULL. Estate administrator: Thomas Collins — grant of administration (NSW Supreme Court) attached. Property not yet transferred to beneficiaries. AI must name Margaret Collins as deceased and Thomas Collins as administrator. AI must explicitly flag that the date of death is missing and request it (death certificate or probate document). AI must NOT invent or approximate a date of death. AI may outline the R5 argument structure but must not complete it without the death date.',
};

// ─── INV — Inverse ────────────────────────────────────────────────────────────

const INV_001 = {
  seq: 47, id: 'INV-001',
  address: '33 INDUSTRIAL DR', suburb: 'Wetherill Park', postcode: '2164',
  pid: '5577991', lotDp: 'Lot 7 DP 557799', lot: '7', plan: '557799',
  assessedValue: 5000000, priorValue: 4500000, landAreaSqm: 2500,
  zoningCode: 'E5', zoningLabel: 'Heavy Industrial',
  concessionMentions: [
    's14L(1)(A) Onsite Allowance — CURRENTLY ACTIVE — $750,000 deduction — but REMEDIATION IS COMPLETE — EPA Site Audit Statement SAS/2021/4456 (14 June 2021) confirms site clean — concession should have been REMOVED — current taxable value $4,250,000 is WRONG — correct taxable $5,000,000',
  ],
  groundAnalysis: {
    '9': 's14L(1)(A) Onsite Allowance is currently active ($750,000 deduction, current taxable $4,250,000). Remediation COMPLETE: EPA Site Audit Statement SAS/2021/4456 (14 June 2021) confirms site is clean — the basis for the allowance no longer exists. Concession should be REMOVED. Correct taxable: $5,000,000 (full, unencumbered). Context: compulsory acquisition by Transport for NSW — Valuation of Land Act 1916 (NSW) applies as the full unencumbered market value underpins the compensation amount. Land Tax Management Act 1956 (NSW) s14L(1)(A).',
  },
  reportNotes: 'E5 Heavy Industrial (Fairfield LEP 2013). s14L(1)(A) Onsite Allowance is currently active: $750,000 deduction, current taxable $4,250,000. HOWEVER: remediation is COMPLETE. NSW EPA Site Audit Statement SAS/2021/4456 (signed 14 June 2021) confirms site is clean. The basis for the allowance no longer exists. AI must recommend REMOVAL of the s14L(1)(A) concession. Correct taxable value: $5,000,000 (full, unencumbered). Purpose: compulsory acquisition by Transport for NSW — full unencumbered value required.',
};

const INV_002 = {
  seq: 48, id: 'INV-002',
  address: '21 WARATAH AVE', suburb: 'Dee Why', postcode: '2099',
  pid: '4433111', lotDp: 'Lot 6 DP 443311', lot: '6', plan: '443311',
  assessedValue: 1650000, priorValue: 1500000, landAreaSqm: 500,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  concessionMentions: [
    "PPR Exemption — CURRENTLY ACTIVE — but property is INVESTMENT PROPERTY — tenanted since 15 March 2019 — tenant Sarah Brown $2,800/week — owner PPR is 44 Palm Beach Road Palm Beach NSW 2108 — PPR exemption must be REMOVED",
  ],
  groundAnalysis: {
    '9': "PPR (Principal Place of Residence) exemption is currently active — INCORRECT. Property has been tenanted since 15 March 2019 (tenant: Sarah Brown, $2,800/week rental income). Owner's actual PPR: 44 Palm Beach Road, Palm Beach NSW 2108. PPR exemption must be REMOVED. Correct land tax payable: 1.6% × $1,650,000 = $26,400 per year. Context: Revenue NSW audit — owner self-reporting error. Land Tax Management Act 1956 (NSW).",
  },
  reportNotes: "R2 Low Density Residential (Northern Beaches LEP 2021). PPR exemption currently active — INCORRECT. Property is an investment property: tenanted since 15 March 2019 (tenant Sarah Brown, $2,800/week rental income). Owner's principal place of residence is 44 Palm Beach Road, Palm Beach NSW 2108. AI must identify the PPR exemption as wrongly applied, confirm investment property status via tenancy evidence, identify owner's true PPR, and recommend REMOVAL of the PPR exemption. Correct land tax payable: 1.6% * $1,650,000 = $26,400 per year. Revenue NSW audit — owner self-reporting error.",
};

// ─── R1X / R2X — Edge Cases ───────────────────────────────────────────────────

const R1X_001 = {
  seq: 49, id: 'R1X-001',
  address: '12 RIVERSIDE WAY', suburb: 'Windsor', postcode: '2756',
  pid: '7788011', lotDp: 'Lot 14 DP 778801', lot: '14', plan: '778801',
  assessedValue: 1100000, priorValue: 980000, landAreaSqm: 1200,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  concessionMentions: [
    'SEPP (Resilience and Hazards) 2021 — Flood Planning Area — Category 1 flood constraint — $180,000 flood mitigation cost confirmed by council flood certificate — FSR restricted 0.35:1 vs standard 0.5:1 — combined -25% adjustment',
  ],
  groundAnalysis: {
    '1': 'SEPP (Resilience and Hazards) 2021 — Flood Planning Area Category 1. Flood mitigation cost $180,000 confirmed by council flood certificate. FSR restricted 0.35:1 vs standard R2 0.5:1 (30% reduction in developable floor space — Section 10.7). VG used unconstrained R2 comparables at $917/m² — no flood or FSR adjustment applied. Combined adjustment: −15% flood/mitigation + −10% FSR restriction = −25%. Argued: $900/m² avg × 75% = $675/m² × 1,200 m² = $810,000 vs assessed $1,100,000. Overvaluation: $290,000.',
  },
  comparables: [
    { address: '8 GEORGE ST WINDSOR NSW 2756', area_m2: 1180, zone: 'R2', analysed_land_value: 1062000, rate_per_m2: 900, contract_date: '2024-02-01' },
    { address: '19 THOMPSON SQ WINDSOR NSW 2756', area_m2: 1220, zone: 'R2', analysed_land_value: 1098000, rate_per_m2: 900, contract_date: '2024-04-01' },
    { address: '5 BRIDGE RD WINDSOR NSW 2756', area_m2: 1200, zone: 'R2', analysed_land_value: 1080000, rate_per_m2: 900, contract_date: '2024-01-01' },
  ],
  reportNotes: 'R2 (Hawkesbury LEP 2012). Assessed $1,100,000 ($917/m2). SEPP (Resilience and Hazards) 2021 — Flood Planning Area Category 1. Flood mitigation cost $180,000 (council flood certificate). FSR restricted 0.35:1 vs standard 0.5:1 (30% reduction in developable floor space — Section 10.7). VG used unconstrained R2 comparables averaging $900/m2 — no flood or FSR adjustment. Adjustments: flood/mitigation -15%, FSR restriction -10%, combined -25%. Argued: $900/m2 * 75% = $675/m2 * 1,200 m2 = $810,000. Valuation of Land Act 1916 (NSW).',
  inputDocuments: [
    'Council flood certificate: SEPP (Resilience and Hazards) 2021 — Flood Planning Area — Category 1 — $180,000 flood resilient building requirement. Section 10.7: FSR 0.35:1 (vs standard R2 0.5:1). VG comparables at $917/m2 are unconstrained — no flood or FSR adjustment applied. Argued: $810,000.',
  ],
};

const R2X_001 = {
  seq: 50, id: 'R2X-001',
  address: '5 MANNING RD', suburb: 'Woollahra', postcode: '2025',
  pid: '1199881', lotDp: 'Lot 2 DP 119988', lot: '2', plan: '119988',
  assessedValue: 3800000, priorValue: 3400000, landAreaSqm: 620,
  zoningCode: 'R2', zoningLabel: 'Low Density Residential',
  heritageMentions: [
    'Heritage Item I45 — individually listed — Woollahra Local Environmental Plan 2014 — Woollahra Heritage Conservation Area — Section 10.7 certificate — NSW Heritage Office 2023 market study: 18% premium over non-heritage equivalents',
  ],
  groundAnalysis: {
    '2': 'ASSESSED VALUE TOO LOW. Heritage Item I45 — individually listed under Woollahra Local Environmental Plan 2014 + Woollahra Heritage Conservation Area (Section 10.7 certificate confirms). NSW Heritage Office 2023 market study: heritage-listed Woollahra properties average 18% premium over non-heritage equivalents. VG used non-heritage R2 comparables at $6,100/m² — incorrect for an individually listed heritage property. Heritage comparable sales average $7,400/m². Argued value: $7,400/m² × 620 m² = $4,588,000 vs assessed $3,800,000. Undervaluation: $788,000. FINANCIAL WARNING: higher valuation increases land tax liability — accounting advice required.',
  },
  comparables: [
    { address: '9 MANNING RD WOOLLAHRA NSW 2025', area_m2: 610, zone: 'R2', analysed_land_value: 4514000, rate_per_m2: 7400, contract_date: '2024-03-01' },
    { address: '3 OCEAN ST WOOLLAHRA NSW 2025', area_m2: 630, zone: 'R2', analysed_land_value: 4662000, rate_per_m2: 7400, contract_date: '2024-01-01' },
    { address: '14 QUEEN ST WOOLLAHRA NSW 2025', area_m2: 615, zone: 'R2', analysed_land_value: 4551000, rate_per_m2: 7400, contract_date: '2024-04-01' },
  ],
  reportNotes: "R2 (Woollahra LEP 2014). ASSESSED VALUE BELOW MARKET (R2 — Too Low). Heritage Item I45 — individually listed Woollahra LEP 2014 + Woollahra HCA (Section 10.7). NSW Heritage Office 2023 market study: heritage-listed Woollahra properties average 18% premium over non-heritage equivalents. VG used non-heritage R2 comparables at $6,100/m2 — ignores heritage premium. Heritage comparable sales average $7,400/m2. Argued: $7,400/m2 * 620 m2 = $4,588,000. FINANCIAL WARNING: higher value = higher land tax. Accounting advice required.",
  inputDocuments: [
    'Section 10.7 Planning Certificate: Heritage Item I45 — Woollahra LEP 2014 — Woollahra Heritage Conservation Area. NSW Heritage Office 2023 market study: 18% heritage premium confirmed. VG used non-heritage comparables at $6,100/m2 — incorrect for individually listed heritage property. Three heritage-listed comparable sales in Woollahra: avg $7,400/m2. Argued $4,588,000. Financial warning required.',
  ],
};

// ─── Main export ─────────────────────────────────────────────────────────────

export async function seedAccuracyGap(dataSource: DataSource): Promise<void> {
  const userRepo = dataSource.getRepository(User);
  const accountant = await userRepo.findOneBy({ email: ACCOUNTANT_EMAIL });
  if (!accountant) {
    throw new Error(`[AccuracyTestSeeder] "${ACCOUNTANT_EMAIL}" not found — run seedUsers() first.`);
  }

  const clientRepo = dataSource.getRepository(Client);
  logger.log('\n── Accuracy tests: Gap scenarios (ADV/CRX/MIS/INV/R1X/R2X) ─────');

  for (const scenario of [
    ADV_001, ADV_002, ADV_003,
    CRX_001, CRX_002, CRX_003,
    MIS_001, MIS_002, MIS_003,
    INV_001, INV_002,
    R1X_001, R2X_001,
  ]) {
    await seedAccScenario(dataSource, clientRepo, accountant.id, scenario);
  }
}
