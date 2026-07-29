/**
 * Zoning family — strips trailing digits so subtypes of the same zoning group compare equal
 * (e.g. "R2" and "R3" both -> "R", "RU1" and "RU2" both -> "RU"). Used to distinguish a
 * "compatible zoning" comparable (same family, different exact code) from a genuinely
 * "different zoning class" comparable (different family), per the NSW comparable-selection
 * screening guide's hard gate on permitted use / zoning.
 */
export function zoningFamily(zoning: string | null | undefined): string {
  return (zoning ?? '').trim().toUpperCase().replace(/[0-9]+$/, '');
}
