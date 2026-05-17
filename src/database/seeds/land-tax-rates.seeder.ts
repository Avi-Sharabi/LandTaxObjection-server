import { Logger } from '@nestjs/common';
import { LandTaxRate } from 'src/api/valuation/entities/land-tax-rate.entity';
import { DataSource } from 'typeorm';

const logger = new Logger('LandTaxRatesSeeder');

const RATES: Omit<LandTaxRate, 'id' | 'created_at'>[] = [
  {
    tax_year: 2024,
    threshold: 1_075_000,
    base_amount: 100,
    marginal_rate_pct: 1.6,
    premium_threshold: 6_571_000,
    premium_base_amount: 88_395,
    premium_rate_pct: 2.0,
    foreign_surcharge_pct: 4.0,
  },
  {
    tax_year: 2025,
    threshold: 1_187_000,
    base_amount: 100,
    marginal_rate_pct: 1.6,
    premium_threshold: 4_856_000,
    premium_base_amount: 61_876,
    premium_rate_pct: 2.0,
    foreign_surcharge_pct: 4.0,
  },
  {
    tax_year: 2026,
    threshold: 1_075_000,
    base_amount: 100,
    marginal_rate_pct: 1.6,
    premium_threshold: 6_571_000,
    premium_base_amount: 88_036,
    premium_rate_pct: 2.0,
    foreign_surcharge_pct: 4.0,
  },
];

export async function seedLandTaxRates(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(LandTaxRate);

  for (const rate of RATES) {
    const exists = await repo.findOneBy({ tax_year: rate.tax_year });
    if (!exists) {
      await repo.save(repo.create(rate));
      logger.log(`Seeded land tax rate: ${rate.tax_year}`);
    } else {
      logger.log(`Skipped (already exists): ${rate.tax_year}`);
    }
  }
}
