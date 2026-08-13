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
 * Collapses a free-text address down to a comparison key, for deciding whether two intake
 * submissions describe the same property. Uppercases, replaces each run of non-alphanumerics with a
 * single space, then drops a trailing state-and-postcode pair — so "Unit 4, 25 Terminus St, Castle
 * Hill NSW 2154" and "UNIT 4  25 TERMINUS ST, CASTLE HILL" collapse to the same key.
 *
 * Two deliberate choices, both because a false *miss* only costs a duplicate row while a false
 * *merge* writes the wrong land value into a VG lodgement:
 *
 *  - Separators become a space rather than being deleted. Deleting them collapses NSW's standard
 *    strata notation into a street number — "4/25 Terminus St" and "425 Terminus St" are different
 *    properties, and the intake DTO's own example is a unit address.
 *  - A trailing 4-digit group is only stripped when a state token precedes it. An unconditional
 *    strip eats deposited-plan numbers ("Lot 2 DP 1234" vs "DP 5678"), and lot/DP is a first-class
 *    column on Property. The cost is that a bare trailing postcode with no state token is kept, so
 *    "… CASTLE HILL 2154" and "… CASTLE HILL" are treated as different — a safe miss.
 *
 * This MUST stay equivalent to the `address_normalized` STORED generated column on `properties`
 * (see the AddPropertyAddressNormalized migration). The lookup in DisputeIntakeOrchestrator compares
 * this function's output against that column, so if the two ever diverge the match silently misses
 * and duplicate rows come back — the exact bug this was written to fix.
 *
 * Can legitimately return '' (e.g. "NSW 2000", ",,,"), which is NOT a usable match key — callers
 * must skip the address lookup when it does, or every junk address for one client merges together.
 */
export function normalizePropertyAddress(address: string): string {
  return (address ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/( |^)(NSW|VIC|QLD|WA|SA|TAS|ACT|NT) [0-9]{4}$/, '');
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
