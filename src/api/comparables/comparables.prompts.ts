export interface SubjectContext {
  pid: string;
  suburb: string;
  postcode: string | null;
  landAreaSqm: number | null;
  zoning: string;
  lotDp: string | null;
  dimensions: string | null;
  heightLimitM: number | null;
  vgValueCurrent: number;
  vgValuePrior: number;
  landAreaVgSqm: number | null;
  valuationDate: string;
}

export function buildUserPrompt(
  subject: SubjectContext,
  candidates: Record<string, unknown>[],
): string {
  const yoyPct = subject.vgValuePrior > 0
    ? (((subject.vgValueCurrent - subject.vgValuePrior) / subject.vgValuePrior) * 100).toFixed(1)
    : 'N/A';
  const vgRatePerSqm = subject.landAreaSqm && subject.landAreaSqm > 0
    ? (subject.vgValueCurrent / subject.landAreaSqm).toFixed(0)
    : 'unknown';
  const vgPriorRatePerSqm = subject.landAreaSqm && subject.landAreaSqm > 0
    ? (subject.vgValuePrior / subject.landAreaSqm).toFixed(0)
    : 'unknown';

  const subjectLines = [
    subject.lotDp ? `- Lot/DP: ${subject.lotDp}` : null,
    `- PID: ${subject.pid}`,
    subject.suburb ? `- Suburb: ${subject.suburb}` : null,
    subject.landAreaSqm ? `- Land area: ${subject.landAreaSqm.toLocaleString()}m²${subject.landAreaVgSqm ? ` (VG used ${subject.landAreaVgSqm.toLocaleString()}m² — possible factual error)` : ''}` : null,
    subject.dimensions ? `- Dimensions: ${subject.dimensions}` : null,
    `- Zoning: ${subject.zoning}`,
    subject.heightLimitM ? `- Height limit: ${subject.heightLimitM}m` : null,
    subject.vgValueCurrent ? `- VG land value current year: $${subject.vgValueCurrent.toLocaleString()} ($${vgRatePerSqm}/m²)` : null,
    subject.vgValuePrior ? `- VG land value prior year: $${subject.vgValuePrior.toLocaleString()} ($${vgPriorRatePerSqm}/m²)` : null,
    subject.vgValuePrior ? `- YoY increase: +${yoyPct}%` : null,
    `- Valuation date: ${subject.valuationDate}`,
  ].filter(Boolean).join('\n');

  const hasCandidates = candidates.length > 0;

  return `Select comparable sales for a NSW land tax objection on the following subject property:

${subjectLines}

YOUR ONLY JOB: Select up to 10 records from the candidates below and return them as a JSON array. Do not add, modify, or omit any field values — return each selected record exactly as provided. The fields adjusted_rate_per_sqm, adjusted_land_value, suggested_land_value, and explanation will be computed server-side; set them to null in your output.

SELECTION CRITERIA (apply in order):
1. Vacant land, same zoning (${subject.zoning}), same suburb — strongest evidence
2. Improved sales, same zoning, same suburb
3. Vacant land, same zoning, nearby suburb
4. Improved sales, same zoning, nearby suburb
5. Compatible zoning only if same-zoning evidence is insufficient
6. Different zoning class — last resort only

Within each tier: no sale_code flag preferred, more recent preferred, area closest to ${subject.landAreaSqm}m² preferred.

TARGET: Return between 5 and 10 records. You MUST work through the tiers in order until you have at least 5 records. Do not stop at a single tier — if tier 1 yields fewer than 5, continue to tier 2, then tier 3, and so on. Only exclude records where purchase_price is null or area is null. Do NOT filter records based on rate per m² or whether you think they support the objection — the reviewer will assess that.

Return ONLY a valid JSON array with no markdown or prose. Each element must contain exactly these fields (copy values verbatim from the candidate record):
id, property_id, district_code, property_house_number, property_street_name, property_locality, property_post_code, area, zoning, nature_of_property, primary_purpose, component_code, sale_code, interest_of_sale_percent, contract_date, purchase_price, dealing_number, owner_type, adjusted_rate_per_sqm, adjusted_land_value, suggested_land_value, explanation.

${hasCandidates
    ? `CANDIDATE SALES (${candidates.length} records — pre-filtered to the subject's suburb, postcode, and immediate postcode corridor with same zoning; treat all as geographically relevant):
${JSON.stringify(candidates)}

If you still have fewer than 5 records with non-null purchase_price and area after reviewing all candidates, use the search_comparable_sales MCP tool to expand the search. Use database tools at most 3 times.`
    : `No pre-fetched candidates available. Use the search_comparable_sales MCP tool to find comparable sales in the same or nearby catchment. Use database tools at most 3 times.`}`;
}
