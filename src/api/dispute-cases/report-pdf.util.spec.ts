import { findLeftoverArtifact, sanitiseForArtifactGuard } from './report-pdf.util';

// The guard was previously a private static on ValuationReportService and was never exercised: that
// spec mocks nunjucks, so no real HTML ever reached it. These are its first tests — it is the last
// thing between an unresolved token and a client-facing PDF.
describe('findLeftoverArtifact', () => {
  it.each([
    ['a bracketed placeholder', '<p>Owner: [ADDRESS]</p>', '[ADDRESS]'],
    ['an unresolved Nunjucks expression', '<td>{{ meta.valuation_date }}</td>', '{{ meta.valuation_date }}'],
    ['a TODO marker', '<p>TODO confirm the area</p>', 'TODO'],
    ['a TBD marker', '<p>Deadline: TBD</p>', 'TBD'],
    ['an XXX marker', '<p>Rate: XXX per m²</p>', 'XXX'],
    ['filler text', '<p>Lorem ipsum dolor sit amet</p>', 'Lorem ipsum'],
  ])('rejects %s', (_label, html, expected) => {
    expect(findLeftoverArtifact(html)).toBe(expected);
  });

  it('passes clean report HTML, including the closed vocabulary the section guide mandates', () => {
    const html = [
      '<table><tr><td>Land Tax Payable</td><td>UNCONFIRMED — obtain from assessment notice</td></tr>',
      '<tr><td>Lot/DP</td><td>-</td></tr>',
      '<tr><td>Rates</td><td>$1,040-$1,110/m²</td></tr></table>',
    ].join('');
    expect(findLeftoverArtifact(html)).toBeNull();
  });

  it('does not fire on ordinary prose containing a bracketed lower-case aside', () => {
    // The pattern is deliberately [A-Z_]+ only, so a legitimate "[see section 4]" style aside is not
    // mistaken for an unfilled template field.
    expect(findLeftoverArtifact('<p>the easement [see section 4] reduces usable area</p>')).toBeNull();
  });
});

describe('sanitiseForArtifactGuard', () => {
  it('neutralises every pattern the guard would reject', () => {
    const stored =
      'Flood overlay affects [ADDRESS]; area is {{ area }} m²; TODO obtain the certificate; TBD; XXX.';
    const sanitised = sanitiseForArtifactGuard(stored);

    expect(findLeftoverArtifact(sanitised)).toBeNull();
  });

  it('keeps the surrounding sentence readable so the reader can see the source was incomplete', () => {
    expect(sanitiseForArtifactGuard('Flood overlay affects [ADDRESS] per the notice.')).toBe(
      'Flood overlay affects (unfilled field) per the notice.',
    );
  });

  it('leaves genuine content untouched', () => {
    const clean = 'Six vacant-land sales within 1.2 km; rates span $1,040-$1,110/m² on a land-only basis.';
    expect(sanitiseForArtifactGuard(clean)).toBe(clean);
  });

  it('is idempotent, so a value sanitised twice is unchanged', () => {
    const once = sanitiseForArtifactGuard('Owner: [OWNER_NAME], TODO verify');
    expect(sanitiseForArtifactGuard(once)).toBe(once);
  });
});
