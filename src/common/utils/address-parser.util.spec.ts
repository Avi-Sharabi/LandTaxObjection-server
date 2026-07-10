import { parseNswAddressComponents } from './address-parser.util';

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
});
