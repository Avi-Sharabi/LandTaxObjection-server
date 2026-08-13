import {
  parseNswAddressComponents,
  stripTrailingPostcode,
  resolveSuburbWithFallback,
  normalizePropertyAddress,
} from './address-parser.util';

describe('parseNswAddressComponents', () => {
  it('extracts a multi-word suburb', () => {
    expect(
      parseNswAddressComponents('1020 MELIA CT CASTLE HILL NSW 2154'),
    ).toEqual({
      suburb: 'CASTLE HILL',
      postcode: '2154',
    });
  });

  it('extracts a single-word suburb', () => {
    expect(
      parseNswAddressComponents('24 BROMPTON RD KENSINGTON NSW 2033'),
    ).toEqual({
      suburb: 'KENSINGTON',
      postcode: '2033',
    });
  });

  it('does not treat "PARK" as a street-type suffix', () => {
    expect(
      parseNswAddressComponents('30 COMMERCE RD WETHERILL PARK NSW 2164'),
    ).toEqual({
      suburb: 'WETHERILL PARK',
      postcode: '2164',
    });
  });

  it('ignores a leading unit-number prefix', () => {
    expect(
      parseNswAddressComponents('Unit 4 25 TERMINUS ST CASTLE HILL NSW 2154'),
    ).toEqual({
      suburb: 'CASTLE HILL',
      postcode: '2154',
    });
  });

  it('strips leading and trailing commas from a comma-separated address', () => {
    expect(
      parseNswAddressComponents('25 Terminus St, Castle Hill, NSW 2154'),
    ).toEqual({
      suburb: 'CASTLE HILL',
      postcode: '2154',
    });
  });

  it('handles an address with no trailing state/postcode', () => {
    expect(
      parseNswAddressComponents('Unit 4 25 TERMINUS ST CASTLE HILL'),
    ).toEqual({
      suburb: 'CASTLE HILL',
      postcode: undefined,
    });
  });

  it('returns only postcode when no street-type suffix is present', () => {
    expect(
      parseNswAddressComponents('Lot 12 Farm Access CASTLE HILL NSW 2154'),
    ).toEqual({
      suburb: undefined,
      postcode: '2154',
    });
  });

  it('returns nothing for empty or garbage input without throwing', () => {
    expect(parseNswAddressComponents('')).toEqual({
      suburb: undefined,
      postcode: undefined,
    });
    expect(parseNswAddressComponents('   ')).toEqual({
      suburb: undefined,
      postcode: undefined,
    });
    expect(parseNswAddressComponents('asdf;;;')).toEqual({
      suburb: undefined,
      postcode: undefined,
    });
  });

  // Fixture addresses used by the accuracy-test / objection-reason seeders — must keep parsing correctly.
  it.each([
    ['1020 MELIA CT CASTLE HILL NSW 2154', 'CASTLE HILL', '2154'],
    ['21 BERNERA RD PRESTONS NSW 2170', 'PRESTONS', '2170'],
    ['23 BERNERA RD PRESTONS NSW 2170', 'PRESTONS', '2170'],
    ['120 RIVER RD GOULBURN NSW 2580', 'GOULBURN', '2580'],
    ['30 COMMERCE RD WETHERILL PARK NSW 2164', 'WETHERILL PARK', '2164'],
  ])(
    'parses seeder fixture "%s"',
    (address, expectedSuburb, expectedPostcode) => {
      expect(parseNswAddressComponents(address)).toEqual({
        suburb: expectedSuburb,
        postcode: expectedPostcode,
      });
    },
  );

  it('strips a bare trailing postcode when the address omits an NSW token', () => {
    expect(
      parseNswAddressComponents('24 Brompton Rd, Kensington 2033'),
    ).toEqual({
      suburb: 'KENSINGTON',
      postcode: '2033',
    });
  });
});

describe('stripTrailingPostcode', () => {
  it('strips a trailing postcode and whitespace', () => {
    expect(stripTrailingPostcode('KENSINGTON 2033')).toBe('KENSINGTON');
  });

  it('strips a postcode preceded by an NSW token without double-stripping', () => {
    expect(stripTrailingPostcode('CASTLE HILL NSW 2154')).toBe('CASTLE HILL');
  });

  it('is a no-op when there is no trailing postcode', () => {
    expect(stripTrailingPostcode('KENSINGTON')).toBe('KENSINGTON');
  });

  it('strips surrounding commas and whitespace', () => {
    expect(stripTrailingPostcode(' Kensington 2033, ')).toBe('Kensington');
  });

  it('handles empty input without throwing', () => {
    expect(stripTrailingPostcode('')).toBe('');
  });
});

describe('resolveSuburbWithFallback', () => {
  it('uses the primary parser when it can isolate a suburb', () => {
    expect(
      resolveSuburbWithFallback('Unit 4 25 TERMINUS ST CASTLE HILL NSW 2154'),
    ).toBe('CASTLE HILL');
  });

  it('falls back to a comma-split when the primary parser finds no street-type suffix, stripping a trailing postcode from the fallback', () => {
    expect(
      resolveSuburbWithFallback('Lot 12 Farm Access, Kensington 2033'),
    ).toBe('KENSINGTON');
  });

  it('returns an empty string when there is no comma-delimited fallback fragment either', () => {
    expect(resolveSuburbWithFallback('Lot 12 Farm Access')).toBe('');
  });
});

describe('normalizePropertyAddress', () => {
  it('collapses casing, punctuation and whitespace to a single key', () => {
    expect(normalizePropertyAddress('Unit 4, 25 Terminus St,  Castle Hill'))
      .toBe('UNIT 4 25 TERMINUS ST CASTLE HILL');
  });

  it('treats the same address typed two ways as one property', () => {
    expect(normalizePropertyAddress('25 TERMINUS ST CASTLE HILL NSW 2154'))
      .toBe(normalizePropertyAddress('25 terminus st, castle hill'));
  });

  it('keeps genuinely different addresses distinct', () => {
    expect(normalizePropertyAddress('25 TERMINUS ST CASTLE HILL'))
      .not.toBe(normalizePropertyAddress('27 TERMINUS ST CASTLE HILL'));
  });

  it('does not collapse unit numbers within a strata block', () => {
    expect(normalizePropertyAddress('Unit 4 25 Terminus St'))
      .not.toBe(normalizePropertyAddress('Unit 5 25 Terminus St'));
  });

  // ── False-merge guards. Each of these collapsed to a shared key under the first
  // implementation, which would have attached a case to the wrong property.
  it('does not collapse strata notation into a street number', () => {
    expect(normalizePropertyAddress('4/25 Terminus St, Castle Hill'))
      .not.toBe(normalizePropertyAddress('425 Terminus St, Castle Hill'));
  });

  it('does not strip deposited-plan numbers as if they were postcodes', () => {
    expect(normalizePropertyAddress('Lot 2 DP 1234'))
      .not.toBe(normalizePropertyAddress('Lot 2 DP 5678'));
    expect(normalizePropertyAddress('Lot 2 DP 1234')).toBe('LOT 2 DP 1234');
  });

  it('only strips a trailing postcode when a state token precedes it', () => {
    expect(normalizePropertyAddress('25 Terminus St Castle Hill NSW 2154'))
      .toBe('25 TERMINUS ST CASTLE HILL');
    // No state token, so the digits are kept — a safe miss rather than a risky merge.
    expect(normalizePropertyAddress('25 Terminus St Castle Hill 2154'))
      .toBe('25 TERMINUS ST CASTLE HILL 2154');
  });

  it('strips the postcode for every jurisdiction the enum supports', () => {
    for (const state of ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']) {
      expect(normalizePropertyAddress(`1 Test St Suburb ${state} 2000`)).toBe('1 TEST ST SUBURB');
    }
  });

  it('returns an empty key for input that carries no address at all', () => {
    // Callers must treat '' as "do not match" — these all pass @IsNotEmpty().
    expect(normalizePropertyAddress('NSW 2000')).toBe('');
    expect(normalizePropertyAddress(',,,')).toBe('');
    expect(normalizePropertyAddress('   ')).toBe('');
  });

  it('handles empty input without throwing', () => {
    expect(normalizePropertyAddress('')).toBe('');
  });

  // The `address_normalized` column on `properties` is a Postgres STORED generated column. If its
  // SQL expression and this function ever diverge, the intake lookup silently misses and duplicate
  // property rows come back — the exact bug this was written to fix. There is no real-Postgres unit
  // test path in this repo, so pin the two together by replicating the SQL semantics here.
  describe('parity with the address_normalized generated column', () => {
    // regexp_replace(
    //   btrim(regexp_replace(upper(address), '[^A-Z0-9]+', ' ', 'g')),
    //   '( |^)(NSW|VIC|QLD|WA|SA|TAS|ACT|NT) [0-9]{4}$', ''
    // )
    const sqlExpression = (address: string): string =>
      address
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim()
        .replace(/( |^)(NSW|VIC|QLD|WA|SA|TAS|ACT|NT) [0-9]{4}$/, '');

    const fixtures = [
      '25 TERMINUS ST CASTLE HILL NSW 2154',
      'Unit 4, 25 Terminus St, Castle Hill',
      '4/25 Terminus St, Castle Hill',
      '425 Terminus St, Castle Hill',
      '1020 MELIA CT CASTLE HILL NSW 2154',
      "12 O'Connor St, Kensington",
      'Lot 2 DP 1234',
      'Lot 12 Farm Access',
      '30 COMMERCE RD WETHERILL PARK NSW 2164',
      '1 Test St Suburb VIC 3000',
      'NSW 2000',
      ',,,',
      '   ',
      '',
    ];

    it.each(fixtures)('matches the SQL expression for %p', (address) => {
      expect(normalizePropertyAddress(address)).toBe(sqlExpression(address));
    });
  });
});
