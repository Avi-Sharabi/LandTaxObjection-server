export interface SubjectContext {
  pid: string;
  suburb: string;
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

  return `Analyse comparable sales for the following subject property for a land tax objection:

${subjectLines}

${hasCandidates
    ? `Pre-fetched candidate sales (${candidates.length} records from the database):
${JSON.stringify(candidates)}

Select the best comparables from the pre-fetched list above. If after applying size and time adjustments (see below) the pre-fetched set contains fewer than 5 same-zoning candidates with an adjusted rate at or below the VG rate of $${vgRatePerSqm}/m², you MUST use the search_comparable_sales MCP tool to broaden the search to nearby industrial suburbs (e.g. Moorebank, Casula, Chipping Norton, Ingleburn, Minto, Prestons) before finalising your selection. Use database tools at most 3 times per analysis.`
    : `Query property_sales_raw via the search_comparable_sales MCP tool for comparable sales in the same or nearby catchment with matching or similar zoning. If the first search returns fewer than 5 same-zoning candidates with an adjusted rate at or below the VG rate of $${vgRatePerSqm}/m², widen the catchment to nearby industrial suburbs. Use database tools at most 3 times per analysis.`}

Return ONLY a valid JSON array — no markdown, no prose, no code fences. Each element must contain exactly these fields:
id, property_id, district_code, property_house_number, property_street_name, property_locality, property_post_code, area, zoning, nature_of_property, primary_purpose, component_code, sale_code, interest_of_sale_percent, contract_date, purchase_price, dealing_number, owner_type, adjusted_rate_per_sqm, adjusted_land_value, suggested_land_value, explanation.

Omit all other columns. Computed fields:
- adjusted_rate_per_sqm: Derive the fully adjusted land rate per m² using these steps in order (null if area is zero or null):
  Step 1 — Normalise area: if area < 100, treat as hectares (multiply by 10000).
  Step 2 — Land-only rate:
    • Vacant land (primary_purpose is null/blank or indicates vacant; or nature_of_property = 'V'): land_rate = purchase_price ÷ area.
    • Improved sales: apply DRC improvement stripping — estimate depreciated replacement cost of improvements (industrial/warehouse: $600–900/m² GFA; if GFA unknown use 40–60% of purchase price as improvement value) and deduct before dividing by area. Flag the estimate in the explanation.
  Step 3 — Size adjustment: adjust the land_rate for the size difference relative to the subject (${subject.landAreaSqm}m²).
    size_factor = (${subject.landAreaSqm} / comparable_area) ^ 0.15
    size_adjusted_rate = land_rate × size_factor
    (This reflects that larger sites sell at a lower per-m² rate than smaller sites.)
  Step 4 — Time adjustment: adjust for the period between the sale date and the valuation date (${subject.valuationDate}).
    months_diff = months from contract_date to valuation date
    If months_diff ≤ 12: no time adjustment (neutral market assumed).
    If months_diff > 12: time_factor = 1 + (months_diff × 0.003) — apply a modest +0.3%/month upward trend for industrial land.
    adjusted_rate_per_sqm = round(size_adjusted_rate × time_factor)
  The final adjusted_rate_per_sqm is the size-and-time-adjusted land rate, directly comparable to the VG's assessed rate of $${vgRatePerSqm}/m².
- adjusted_land_value: round(adjusted_rate_per_sqm × comparable_area) — the comparable's OWN land value in dollars after all adjustments. This is what this comparable sale's land is worth. Null if adjusted_rate_per_sqm or area is null.
- suggested_land_value: round(adjusted_rate_per_sqm × ${subject.landAreaSqm}) — the implied land value of the SUBJECT property (${subject.landAreaSqm}m²) based on this comparable's adjusted rate. This is the dollar figure a valuer would use as the suggested land value supported by this sale. Null if adjusted_rate_per_sqm is null.
- explanation: A plain-text multi-line string (use actual newline characters \n — no markdown, no HTML). Format exactly as:
  Line 1: "Rank N — [full address] | [zoning] | [Vacant Land / Improved - primary_purpose]"
  Line 2: "• Sale: [contract date DD Mon YYYY] — $[purchase_price formatted] ([area]m²)"
  Line 3: "• Raw land rate: $[land_rate]/m²" (for improved sales, append " (after improvement deduction of $[deduction_amount])")
  Line 4: "• Size adjustment: factor [size_factor 3dp] ([subject area]m² subject vs [comparable area]m² comparable) → $[size_adjusted_rate]/m²"
  Line 5: "• Time adjustment: [N months] — [nil (within 12-month window) | +X% ([factor 3dp])] → $[adjusted_rate_per_sqm]/m²"
  Line 6: "• Adjusted rate: $[adjusted_rate_per_sqm]/m² vs VG rate $${vgRatePerSqm}/m² → [Supports objection ✓ | Does NOT support objection ✗]"
  Line 7: "• Suggested land value: $[suggested_land_value formatted with commas]"
  Line 8 (only if caveats exist): "• Caveats: [flagged sale code / estimated improvement deduction / zoning mismatch / etc.]"

Sort from most comparable (index 0) to least. Zoning compatibility is the primary criterion — sales from a different zoning class (e.g. residential R2 vs industrial E5) must be ranked below ALL same-zoning comparables regardless of vacancy or location, and should only be included if no same-zoning evidence exists within a reasonable catchment. Ranking hierarchy (apply in order):
1. Vacant, same zoning, same suburb
2. Improved, same zoning, same suburb
3. Vacant, same zoning, nearby suburb / wider catchment
4. Improved, same zoning, nearby suburb / wider catchment
5. Vacant or improved, compatible zoning (e.g. E4 if subject is E5), same or nearby suburb
6. Different zoning class — only as a last resort; flag clearly that the zoning difference makes the comparison unreliable
Within each tier: no sale code flag > flagged, more recent > older, similar size > dissimilar. Strongly prefer vacant land sales within the same zoning as they provide direct land value evidence without improvement stripping.

Return a maximum of 10 comparables. Quality over quantity — include only sales where the derived land rate can be reliably determined. Deprioritise improved sales with sale code flags unless no better evidence exists.`;
}
