export interface NswLandTaxRates {
  threshold: number;
  baseAmount: number;
  marginalRatePct: number;
  premiumThreshold: number;
  premiumBaseAmount: number;
  premiumRatePct: number;
}

export const NSW_LAND_TAX_RATES: Record<number, NswLandTaxRates> = {
  2024: {
    threshold: 1075000,
    baseAmount: 100,
    marginalRatePct: 1.6,
    premiumThreshold: 6571000,
    premiumBaseAmount: 88395,
    premiumRatePct: 2.0,
  },
  2025: {
    threshold: 1187000,
    baseAmount: 100,
    marginalRatePct: 1.6,
    premiumThreshold: 4856000,
    premiumBaseAmount: 61876,
    premiumRatePct: 2.0,
  },
  // 2025–26 financial year (valuation date = 1 July 2025).
  2026: {
    threshold: 1_075_000,
    baseAmount: 100,
    marginalRatePct: 1.6,
    premiumThreshold: 6_571_000,
    premiumBaseAmount: 88_395,
    premiumRatePct: 2.0,
  },
};
