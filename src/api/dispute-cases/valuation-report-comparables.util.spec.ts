import { assignComparableRefs, overrideComparableSalePrice } from './valuation-report-comparables.util';
import { ComparableSale } from '../comparables/entities/comparable-sale.entity';

function makeComparable(overrides: Partial<ComparableSale> = {}): ComparableSale {
  return { id: 'id-1', purchase_price: 1000000, ...overrides } as ComparableSale;
}

describe('assignComparableRefs', () => {
  it('assigns stable C1..Cn refs in fetch order', () => {
    const a = makeComparable({ id: 'a' });
    const b = makeComparable({ id: 'b' });
    const refs = assignComparableRefs([a, b], new Map());

    expect(refs.get('C1')?.comparable).toBe(a);
    expect(refs.get('C2')?.comparable).toBe(b);
  });

  it('carries a quarantine reason through when one is provided for a comparable', () => {
    const a = makeComparable({ id: 'a' });
    const reasonMap = new Map([[a, 'Part-interest sale']]);
    const refs = assignComparableRefs([a], reasonMap);

    expect(refs.get('C1')?.quarantineReason).toBe('Part-interest sale');
  });

  it('quarantineReason is null when no reason is provided', () => {
    const a = makeComparable({ id: 'a' });
    const refs = assignComparableRefs([a], new Map());

    expect(refs.get('C1')?.quarantineReason).toBeNull();
  });
});

describe('overrideComparableSalePrice', () => {
  it('always returns the real DB price regardless of what a fake/hallucinated input row carries', () => {
    const realComparable = makeComparable({ id: 'a', purchase_price: 2305000 });
    const comparableByRef = assignComparableRefs([realComparable], new Map());

    // Simulates the LLM writing a wrong/hallucinated sale_price for this row.
    const hallucinatedRow = { ref: 'C1', sale_price: 999999999, sale_price_display: '$999,999,999' };

    const result = overrideComparableSalePrice(hallucinatedRow, comparableByRef);

    expect(result.sale_price).toBe(2305000);
    expect(result.sale_price_display).toBe('$2,305,000');
  });

  it('renders "-" for an unmatched ref rather than a fabricated number', () => {
    const realComparable = makeComparable({ id: 'a', purchase_price: 2305000 });
    const comparableByRef = assignComparableRefs([realComparable], new Map());

    // Simulates the LLM inventing a comparable row with a ref that was never issued.
    const invented = { ref: 'C99', sale_price: 1234567, sale_price_display: '$1,234,567' };

    const result = overrideComparableSalePrice(invented, comparableByRef);

    expect(result.sale_price).toBeNull();
    expect(result.sale_price_display).toBe('-');
  });

  it('sets quarantined=true and copies the reason for a matched, quarantined row', () => {
    const realComparable = makeComparable({ id: 'a', purchase_price: 2305000 });
    const reasonMap = new Map([[realComparable, 'Statistical outlier — adjusted rate $2/m² falls outside the IQR fence']]);
    const comparableByRef = assignComparableRefs([realComparable], reasonMap);

    const result = overrideComparableSalePrice({ ref: 'C1' }, comparableByRef);

    expect(result.quarantined).toBe(true);
    expect(result.quarantine_reason).toContain('Statistical outlier');
  });

  it('sets quarantined=false for a matched, non-quarantined row, overriding whatever the model wrote', () => {
    const realComparable = makeComparable({ id: 'a', purchase_price: 2305000 });
    const comparableByRef = assignComparableRefs([realComparable], new Map());

    // Model incorrectly claimed this row was quarantined — the real classification always wins.
    const result = overrideComparableSalePrice({ ref: 'C1', quarantined: true, quarantine_reason: 'made up' }, comparableByRef);

    expect(result.quarantined).toBe(false);
    expect(result.quarantine_reason).toBeUndefined();
  });

  it('handles a purchase_price of null gracefully', () => {
    const realComparable = makeComparable({ id: 'a', purchase_price: null });
    const comparableByRef = assignComparableRefs([realComparable], new Map());

    const result = overrideComparableSalePrice({ ref: 'C1' }, comparableByRef);

    expect(result.sale_price).toBeNull();
    expect(result.sale_price_display).toBe('-');
  });
});
