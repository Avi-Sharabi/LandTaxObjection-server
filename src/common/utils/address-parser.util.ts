// Matches the last NSW street-type suffix (ST, RD, CT, etc.) in an address — everything
// after it, up to the trailing " NSW <postcode>", is the suburb. A plain greedy regex
// can't isolate the suburb because both the street name and suburb are free-text
// uppercase words with no delimiter; anchoring on the street-type token avoids that.
const STREET_TYPE_SUFFIX =
  /\b(ST|STREET|RD|ROAD|AVE|AVENUE|CT|COURT|DR|DRIVE|PL|PLACE|CL|CLOSE|CRES|CRESCENT|PDE|PARADE|WAY|LANE|LN|HWY|HIGHWAY|BVD|BLVD|BOULEVARD|GR|GROVE|TCE|TERRACE|CIR|CIRCUIT|SQ|SQUARE|ESP|ESPLANADE|WALK|RISE|LOOP|GDNS|GARDENS|MEWS)\b/gi;

/**
 * Strips a trailing NSW postcode from a free-text fragment — handles both "... NSW 2154" and
 * a bare "... 2154" (no state token), plus surrounding whitespace/commas. Without the bare-
 * postcode strip, an address like "24 Brompton Rd, Kensington 2033" (no "NSW" token) leaks the
 * postcode straight into the parsed suburb, which silently breaks an exact suburb-name match
 * downstream (e.g. ComparablesService.prefetchCandidateSales's `UPPER(property_locality) = $1`).
 */
export function stripTrailingPostcode(value: string): string {
  return value
    .replace(/\s+NSW\s+\d{4}[\s,]*$/i, '')
    .replace(/\s+\d{4}[\s,]*$/, '')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();
}

/**
 * Extracts suburb/postcode from a free-text NSW address such as
 * "1020 MELIA CT CASTLE HILL NSW 2154" or "24 BROMPTON RD KENSINGTON".
 *
 * Known limitation: suburbs whose name itself starts with a street-type word
 * (e.g. "Lane Cove") will mis-parse, since there is no suburb gazetteer to
 * disambiguate — a narrow, enumerable class of false positives.
 */
export function parseNswAddressComponents(address: string): {
  suburb?: string;
  postcode?: string;
} {
  const postcodeMatch = address.match(/(\d{4})\s*$/);
  const postcode = postcodeMatch?.[1];

  const withoutPostcode = stripTrailingPostcode(address);

  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  STREET_TYPE_SUFFIX.lastIndex = 0;
  while ((m = STREET_TYPE_SUFFIX.exec(withoutPostcode)) !== null) {
    lastMatch = m;
  }
  if (!lastMatch) return { postcode };

  const suburb = withoutPostcode
    .slice(lastMatch.index + lastMatch[0].length)
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .toUpperCase();

  return { suburb: suburb || undefined, postcode };
}

/**
 * Resolves a property's suburb for intake: the primary parser, falling back to a naive
 * comma-split (address format "<street>, <suburb>[, ...]") when the primary parser can't
 * isolate one (e.g. no recognizable street-type suffix). The fallback fragment is run through
 * stripTrailingPostcode too, so it can't leak a postcode into the suburb the way the primary
 * parser used to before it also called stripTrailingPostcode.
 */
export function resolveSuburbWithFallback(address: string): string {
  const parsed = parseNswAddressComponents(address).suburb;
  if (parsed) return parsed;

  const fallbackFragment = address.split(',')[1];
  if (!fallbackFragment) return '';

  return stripTrailingPostcode(fallbackFragment).toUpperCase();
}
