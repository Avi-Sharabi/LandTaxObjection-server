export const GROUND_CONTEXT: Record<number, string> = {
  1: 'Ground 1 asserts that the assessed land value is too high. The reason must state the contended value, reference comparable sales (address, DP, sale date, sale price, adjusted land value), and explain how each comparable supports the contended figure.'
    + '\n\nCROSS-GROUND AREA CORRECTION: If another active ground\'s analysis establishes a corrected land area (e.g., Ground 3 identifies an area discrepancy), use ONLY that corrected area for all $/m² rate calculations in this ground. Never use VG\'s recorded area once a correction has been established by another ground\'s analysis in this same objection.'
    + '\n\nMISSING AREA SCENARIO: If the analysis notes state that land area is null, missing, or not recorded (e.g., "LAND AREA FIELD IS NULL"), you MUST: (1) state explicitly that the land area is not recorded in the VG database and is required to calculate the $/m² rate and argued land value; (2) state that no argued land value can be calculated without it; (3) request that the correct cadastral area be obtained from the current title search or deposited plan; (4) DO NOT substitute a comparable sale\'s lot area as a proxy — state this prohibition explicitly.',

  2: 'Ground 2 asserts that the assessed land value is too low. The reason must state the contended (higher) value, reference comparable sales, and explain the market evidence. If the analysis notes include compulsory acquisition context or a financial warning about increased land tax liability, include those. If the analysis notes mention a family law property settlement, co-owner buyout, or co-owner valuation context, include a sentence stating why an accurate current market valuation is essential for that purpose. HERITAGE CITATION (MANDATORY): If the analysis notes contain a heritage item number (e.g. I45, I123) and/or a Local Environmental Plan name (e.g. "Woollahra LEP 2014", "Woollahra Local Environmental Plan 2014"), you MUST include BOTH the exact heritage item number AND the exact LEP name verbatim in your objection text. This is non-negotiable — omitting either constitutes an incomplete objection.',

  3: 'Ground 3 asserts that the area or dimensions of the land recorded on the notice are incorrect. The reason must identify the discrepancy between the area on the notice and the area shown by the official source.',

  4: 'Ground 4 asserts that the description of the land (zone, classification) on the notice is incorrect. The reason must identify the correct zone/description from the official planning instrument.'
    + ' ZONING CITATION: When the analysis notes specify a zone code (e.g. \'E5 Heavy Industrial\') and a named LEP (e.g. \'Liverpool LEP 2008\'), include BOTH the zone code and the full LEP name verbatim in your text. Do not paraphrase or omit either.',

  5: 'Ground 5 asserts that lots have been wrongly grouped and should each be valued separately. '
    + 'Name each lot (Lot X DP XXXXXX) and its separate registered proprietor exactly as shown in the analysis notes. '
    + 'State that each lot holds its own Certificate of Title per NSW LRS. '
    + 'State explicitly that no amalgamation order exists. '
    + 'If owners are different legal entities, name each entity precisely (including ACN if mentioned). '
    + 'CRITICAL: These lots have DIFFERENT registered proprietors — NEVER use the words "same owner", "common owner", "single owner", or "same ownership" anywhere in your response, even in a negative or comparative context. '
    + 'Instead, always describe them as "separate registered proprietors" or "different registered proprietors". '
    + 'Do NOT write phrases like "not the same owner" or "unlike a same owner scenario" — simply avoid the word combination "same owner" entirely. '
    + 'When the analysis notes reference a NSW LRS title search or an ASIC entity search, you MUST cite both by their full name in the objection text: "NSW Land Registry Services" (NSW LRS) for title searches and "Australian Securities and Investments Commission" (ASIC) for entity searches.',

  6: 'Ground 6 asserts that lots should be valued as a single combined holding. '
    + 'Name each lot and confirm same owner (same registered proprietor) for all lots via NSW LRS — use the phrase "same owner". '
    + 'Explain the physical and legal basis for combined valuation from the analysis notes. '
    + 'Include the combined argued value and any water licence or development approval mentioned.',

  7: 'Ground 7 asserts that the person named on the notice is not the correct owner/lessee/occupier. '
    + 'The reason must identify the correct legal entity and reference the official register confirming it. '
    + 'If the correct proprietor is a trust or trustee, use the word "trust" or "trustee" to describe the entity structure. '
    + 'CRITICAL — DO NOT INVENT DATES: If the analysis notes state that any date (date of death, transfer date, or similar) is "NOT RECORDED", "BLANK", "MISSING", or "NULL", you must NEVER write that date in your text. Writing a date that is flagged as missing is a factual error. State explicitly that the date is not available and must be obtained (e.g. from a death certificate, probate document, or NSW LRS dealing number). Do NOT invent, estimate, approximate, or infer any missing date under any circumstances.',

  8: 'Ground 8 asserts that the valuations are incorrectly apportioned. '
    + 'Identify the apportionment error: state the VG\'s wrong basis and the correct basis (e.g. lot entitlements from the strata plan, lot area ratio from the deposited plan, or lease formula). '
    + 'Include the total scheme value, the VG-applied percentage or figure, the correct percentage or figure, and the resulting dollar overcharge. '
    + 'MANDATORY ENTITLEMENT FRACTION: When the analysis notes state a specific entitlement fraction such as "N units / M total = X%" (e.g. "Lot 11 = 12 units / 800 total = 1.5%"), you MUST include BOTH the fraction (N units out of M total, or N/M) AND the percentage (X%) in your text — for example "correct entitlement of 1.5% (12 units out of 800 total)". Writing only the percentage without the underlying fraction is incomplete and insufficient. '
    + 'CONFLICT SCENARIO — If the analysis notes state that entitlement schedules conflict, that the conflict is unresolved, or that no resolution document or adjudication exists: (1) identify BOTH schedules with their exact entitlements as stated in the notes, (2) state explicitly that the conflict is unresolved and no resolution document exists, (3) state that a complete objection cannot be prepared until the conflict is resolved, (4) note that the 60-day deadline still applies. For conflict scenarios, cite both the Valuation of Land Act 1916 (NSW) and the Land Tax Management Act 1956 (NSW). Do NOT draft a complete objection or select one schedule over the other. (5) Do NOT name or suggest any external resolution body, adjudicator, or authority (such as NCAT, NSW Civil and Administrative Tribunal, Fair Trading, NSW Courts, or any similar body) unless it is explicitly named in the analysis notes — inventing a referral or escalation path is a hallucination.',

  9: 'CRITICAL OVERRIDE — PPR MISSING EVIDENCE: If the analysis notes state that a PPR (Principal Place of Residence) flag is set but evidence is missing (e.g. "NO supporting evidence is attached", "no statutory declaration", "no occupancy confirmation"), you MUST: (1) state the full assessed taxable value from the pipeline context WITHOUT any PPR reduction, (2) flag that the PPR exemption cannot be activated without supporting evidence, (3) list the specific missing evidence types from the notes (statutory declaration, council rates notice, occupancy confirmation, etc.), (4) request that the evidence be provided. Do NOT calculate or present any taxable value with PPR applied. Do NOT apply, estimate, or reference any PPR reduction under any circumstances. '
    + 'Ground 9 asserts that a concession or allowance has been incorrectly applied or is missing. '
    + 'State the specific concession type and its exact legislative section (e.g. s14L(1)(A), s14T, s585, s62K) exactly as it appears in the analysis notes. '
    + 'Cite the Land Tax Management Act 1956 (NSW) and the section number. '
    + 'Include all key figures: taxable value, allowance amount, overcharge. '
    + 'Reference the supporting document or register cited in the notes. '
    + 'Write 5–8 sentences — do not truncate at 3–5. '
    + 'Use exact figure formats from the notes ($X/m², dollar amounts with commas). '
    + 'Include ALL regulatory identifiers verbatim (SEPP numbers, mining lease ML numbers, construction certificate CC numbers, DA references, LEP names exactly as stated such as "Hilltops LEP 2021" or "Fairfield LEP 2013", EPA Site Audit Statement numbers in the format SAS/YYYY/NNNN). '
    + 'If the analysis notes state that a concession "should be REMOVED", "must be REMOVED", or "is no longer applicable", write the objection as a REMOVAL scenario: state that the concession has been wrongly applied, that its basis no longer exists (citing the specific evidence verbatim, including any EPA Site Audit Statement number in format SAS/YYYY/NNNN, its date, and the issuing authority NSW EPA when an SAS is mentioned), and request its removal. '
    + 'If the analysis notes state that a concession "has not been applied" or "should be ADDED", write the objection as an ADDITION scenario: state that the concession has not been applied and request that it be applied. '
    + 'For scenarios involving Section 124 Heritage Act 1977, also cite Valuation of Land Act 1916 (NSW) in addition to Land Tax Management Act 1956 (NSW). '
    + 'For scenarios where the context is compulsory acquisition by a government authority (Transport for NSW, Roads and Maritime Services, etc.), also cite Valuation of Land Act 1916 (NSW) since the land valuation underpins the compensation amount. '
    + 'Use "Onsite" and "Offsite" as single unhyphenated words. '
    + 'SECTION NUMBER ACCURACY — Do NOT hallucinate section numbers. Copy section numbers verbatim from the analysis notes. The valid concession sections under the Land Tax Management Act 1956 (NSW) are: s14L(1)(A) Onsite allowance, s14L(1)(B) Offsite allowance, s14L(2) Stratum allowance, s14T Subdividers allowance, s585 Attributable part, s62K Land Tax allowance, and s124 Heritage Act heritage value. Do NOT write s62A, s62B, or any section number not listed here unless it appears verbatim in the analysis notes.',
};
