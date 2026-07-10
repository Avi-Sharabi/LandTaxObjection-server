// Matches the last NSW street-type suffix (ST, RD, CT, etc.) in an address — everything
// after it, up to the trailing " NSW <postcode>", is the suburb. A plain greedy regex
// can't isolate the suburb because both the street name and suburb are free-text
// uppercase words with no delimiter; anchoring on the street-type token avoids that.
const STREET_TYPE_SUFFIX =
  /\b(ST|STREET|RD|ROAD|AVE|AVENUE|CT|COURT|DR|DRIVE|PL|PLACE|CL|CLOSE|CRES|CRESCENT|PDE|PARADE|WAY|LANE|LN|HWY|HIGHWAY|BVD|BLVD|BOULEVARD|GR|GROVE|TCE|TERRACE|CIR|CIRCUIT|SQ|SQUARE|ESP|ESPLANADE|WALK|RISE|LOOP|GDNS|GARDENS|MEWS)\b/gi;

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

  const withoutPostcode = address.replace(/\s+NSW\s+\d{4}\s*$/i, '').trim();

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
