// NSW: the relevant valuation date is 1 July of the year before the land tax year
// (VG bases value on 1 July of the preceding year) — see src/skills/valuation/section_guide.md.
export function getLandTaxYearFromValuationDate(valuationDate: Date | string): number {
  return new Date(valuationDate).getUTCFullYear() + 1;
}
