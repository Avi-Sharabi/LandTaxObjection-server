-- =============================================================================
-- Land Tax Computation Schema
-- TypeORM equivalent: 1777500000000-AddLandTaxComputationSchema.ts
--
-- 1. Creates ownership_type enum for valuation_notices
-- 2. Adds ownership/foreign-surcharge columns to valuation_notices
-- 3. Adds fee/savings columns to dispute_cases
-- 4. Creates land_tax_rates lookup table
-- 5. Seeds NSW land tax rate bands for 2024–2026
--
-- Safe to re-run: all DDL uses IF NOT EXISTS / EXCEPTION guards.
-- =============================================================================

-- ── 1. Enum type ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "valuation_notice_ownership_type_enum" AS ENUM ('individual', 'company_trust');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── 2. valuation_notices columns ─────────────────────────────────────────────
ALTER TABLE valuation_notices
  ADD COLUMN IF NOT EXISTS land_value_2yr_prior  NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS ownership_type        "valuation_notice_ownership_type_enum",
  ADD COLUMN IF NOT EXISTS is_foreign            BOOLEAN NOT NULL DEFAULT false;

-- ── 3. dispute_cases columns ──────────────────────────────────────────────────
ALTER TABLE dispute_cases
  ADD COLUMN IF NOT EXISTS yml_fee_share_pct  NUMERIC(5, 2) NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS tax_saving         NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS yml_revenue        NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS client_savings     NUMERIC(15, 2);

-- ── 4. land_tax_rates table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS land_tax_rates (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year              SMALLINT      NOT NULL UNIQUE,
  threshold             NUMERIC(15, 2) NOT NULL,
  base_amount           NUMERIC(12, 2) NOT NULL,
  marginal_rate_pct     NUMERIC(5, 3)  NOT NULL,
  premium_threshold     NUMERIC(15, 2) NOT NULL,
  premium_base_amount   NUMERIC(12, 2) NOT NULL,
  premium_rate_pct      NUMERIC(5, 3)  NOT NULL,
  foreign_surcharge_pct NUMERIC(5, 3)  NOT NULL DEFAULT 4,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ── 5. NSW rate bands (2024–2026) ─────────────────────────────────────────────
--
-- Source: NSW Revenue — Land Tax Rates
--
-- Calculation reference (marginal band: base + (value − threshold) × marginal_rate_pct):
--   2024: threshold=$1,075,000  | premium_threshold=$6,571,000 | premium_base=$88,395
--   2025: threshold=$1,187,000  | premium_threshold=$4,856,000 | premium_base=$61,876
--   2026: threshold=$1,075,000  | premium_threshold=$6,571,000 | premium_base=$88,036
--         premium_base = $100 + ($6,571,000 − $1,075,000) × 1.6% = $88,036
--
INSERT INTO land_tax_rates
  (tax_year, threshold, base_amount, marginal_rate_pct,
   premium_threshold, premium_base_amount, premium_rate_pct, foreign_surcharge_pct)
VALUES
  (2024, 1075000.00, 100.00, 1.600, 6571000.00, 88395.00, 2.000, 4.000),
  (2025, 1187000.00, 100.00, 1.600, 4856000.00, 61876.00, 2.000, 4.000),
  (2026, 1075000.00, 100.00, 1.600, 6571000.00, 88036.00, 2.000, 4.000)
ON CONFLICT (tax_year) DO NOTHING;
