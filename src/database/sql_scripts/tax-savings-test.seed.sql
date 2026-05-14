-- =============================================================================
-- Tax Savings Test Data Seed
-- Converted from: src/database/seeds/tax-savings-test.seeder.ts
--
-- Seeds 5 dispute cases covering each LandTaxComputationService calculation branch.
-- All cases use tax_year=2026 rates (threshold=$1,075,000, premium_threshold=$6,571,000).
--
-- Prerequisite: users and land_tax_rates tables must be seeded first.
--
-- ┌──────────────────┬──────────────────────────────────────────┬────────────────────────────┐
-- │ Case reference   │ Scenario                                 │ expected_tax_saving        │
-- ├──────────────────┼──────────────────────────────────────────┼────────────────────────────┤
-- │ LTD-2026-TAX-001 │ Individual, both values below threshold  │ 0 (NULL stored)            │
-- │ LTD-2026-TAX-002 │ Individual, standard (above threshold)   │ 16,000                     │
-- │ LTD-2026-TAX-003 │ Company/trust — threshold = 0            │ 8,000                      │
-- │ LTD-2026-TAX-004 │ Foreign individual (+4% surcharge)       │ 56,000                     │
-- │ LTD-2026-TAX-005 │ Individual, premium tier (>$6,571,000)   │ 16,000                     │
-- └──────────────────┴──────────────────────────────────────────┴────────────────────────────┘
--
-- Sample verification request per case:
-- POST /api/dispute-cases/:id/calculate-tax   (no body — reads appraised_value from DB)
-- e.g. POST /api/dispute-cases/c0a80105-0002-4000-a000-000000000005/calculate-tax
-- =============================================================================

DO $$
DECLARE
  v_accountant_id UUID;
BEGIN

  SELECT id INTO v_accountant_id
  FROM users
  WHERE email = 'april.clemente@ymlgroup.com.au';

  IF v_accountant_id IS NULL THEN
    RAISE EXCEPTION '[TaxSavingsTestSeeder] "april.clemente@ymlgroup.com.au" not found — run seedUsers() first.';
  END IF;

  -- ── Clients ──────────────────────────────────────────────────────────────
  INSERT INTO clients (id, name, email, status, assigned_accountant_id)
  VALUES
    (
      'c0a80105-0001-4000-a000-000000000001',
      'Tax Test — TAX-001 — Individual, below threshold (tax_saving = 0)',
      'tax-test-0001@example.com',
      'active',
      v_accountant_id
    ),
    (
      'c0a80105-0002-4000-a000-000000000001',
      'Tax Test — TAX-002 — Individual, standard (tax_saving = 16,000)',
      'tax-test-0002@example.com',
      'active',
      v_accountant_id
    ),
    (
      'c0a80105-0003-4000-a000-000000000001',
      'Tax Test — TAX-003 — Company/trust, no threshold (tax_saving = 8,000)',
      'tax-test-0003@example.com',
      'active',
      v_accountant_id
    ),
    (
      'c0a80105-0004-4000-a000-000000000001',
      'Tax Test — TAX-004 — Foreign individual, +4% surcharge (tax_saving = 56,000)',
      'tax-test-0004@example.com',
      'active',
      v_accountant_id
    ),
    (
      'c0a80105-0005-4000-a000-000000000001',
      'Tax Test — TAX-005 — Individual, premium tier >$6.571M (tax_saving = 16,000)',
      'tax-test-0005@example.com',
      'active',
      v_accountant_id
    )
  ON CONFLICT (id) DO NOTHING;

  -- ── Properties ───────────────────────────────────────────────────────────
  INSERT INTO properties
    (id, client_id, address, suburb, state, postcode, pid,
     ownership_pct, land_area_sqm, zoning, lot_dp, dimensions, height_limit_m)
  VALUES
    (
      'c0a80105-0001-4000-a000-000000000002',
      'c0a80105-0001-4000-a000-000000000001',
      '1 TAX TEST STREET SYDNEY', 'Sydney', 'NSW', '2000', '5010001',
      100.00, 500, 'R2 Low Density Residential', 'Lot 1 / DP 5010001', NULL, NULL
    ),
    (
      'c0a80105-0002-4000-a000-000000000002',
      'c0a80105-0002-4000-a000-000000000001',
      '2 TAX TEST STREET PARRAMATTA', 'Parramatta', 'NSW', '2150', '5010002',
      100.00, 1200, 'R2 Low Density Residential', 'Lot 1 / DP 5010002', NULL, NULL
    ),
    (
      'c0a80105-0003-4000-a000-000000000002',
      'c0a80105-0003-4000-a000-000000000001',
      '3 TAX TEST STREET NORTH SYDNEY', 'North Sydney', 'NSW', '2060', '5010003',
      100.00, 800, 'R2 Low Density Residential', 'Lot 1 / DP 5010003', NULL, NULL
    ),
    (
      'c0a80105-0004-4000-a000-000000000002',
      'c0a80105-0004-4000-a000-000000000001',
      '4 TAX TEST STREET BONDI', 'Bondi', 'NSW', '2026', '5010004',
      100.00, 2000, 'R2 Low Density Residential', 'Lot 1 / DP 5010004', NULL, NULL
    ),
    (
      'c0a80105-0005-4000-a000-000000000002',
      'c0a80105-0005-4000-a000-000000000001',
      '5 TAX TEST STREET MOSMAN', 'Mosman', 'NSW', '2088', '5010005',
      100.00, 5000, 'R2 Low Density Residential', 'Lot 1 / DP 5010005', NULL, NULL
    )
  ON CONFLICT (id) DO NOTHING;

  -- ── Assessment Documents ──────────────────────────────────────────────────
  -- FIX: file_path now uses the dispute case ID (...000000000005) not the document ID
  --      to match the API path pattern: /api/dispute-cases/:id/calculate-tax
  INSERT INTO assessment_documents (id, client_id, file_path, notice_date, valuation_year)
  VALUES
    (
      'c0a80105-0001-4000-a000-000000000003',
      'c0a80105-0001-4000-a000-000000000001',
      'dispute-cases/c0a80105-0001-4000-a000-000000000005/valuation-notice.pdf',  -- FIXED
      '2025-07-01', '2025'
    ),
    (
      'c0a80105-0002-4000-a000-000000000003',
      'c0a80105-0002-4000-a000-000000000001',
      'dispute-cases/c0a80105-0002-4000-a000-000000000005/valuation-notice.pdf',  -- FIXED
      '2025-07-01', '2025'
    ),
    (
      'c0a80105-0003-4000-a000-000000000003',
      'c0a80105-0003-4000-a000-000000000001',
      'dispute-cases/c0a80105-0003-4000-a000-000000000005/valuation-notice.pdf',  -- FIXED
      '2025-07-01', '2025'
    ),
    (
      'c0a80105-0004-4000-a000-000000000003',
      'c0a80105-0004-4000-a000-000000000001',
      'dispute-cases/c0a80105-0004-4000-a000-000000000005/valuation-notice.pdf',  -- FIXED
      '2025-07-01', '2025'
    ),
    (
      'c0a80105-0005-4000-a000-000000000003',
      'c0a80105-0005-4000-a000-000000000001',
      'dispute-cases/c0a80105-0005-4000-a000-000000000005/valuation-notice.pdf',  -- FIXED
      '2025-07-01', '2025'
    )
  ON CONFLICT (id) DO NOTHING;

  -- ── Valuation Notices ────────────────────────────────────────────────────
  -- prior_land_value = ROUND(assessed_land_value * 0.85)
  -- appraised_value = disputed land value used by calculateTax
  INSERT INTO valuation_notices
    (id, property_id, source_document_id, appraised_by_id, valuation_date,
     assessed_land_value, prior_land_value, land_area_vg_sqm,
     appraised_value,
     is_exempt, notice_reference, decision_outcome,
     ownership_type, is_foreign)
  VALUES
    (
      -- TAX-001: vg=$900K, disputed=$750K → individual, not foreign
      'c0a80105-0001-4000-a000-000000000004',
      'c0a80105-0001-4000-a000-000000000002',
      'c0a80105-0001-4000-a000-000000000003',
      v_accountant_id,
      '2025-07-01',
      900000, 765000, 0,
      750000,
      FALSE, 'INTAKE-2025-5010001', 'OBJECTION',
      'individual', FALSE
    ),
    (
      -- TAX-002: vg=$3.5M, disputed=$2.5M → individual, not foreign
      'c0a80105-0002-4000-a000-000000000004',
      'c0a80105-0002-4000-a000-000000000002',
      'c0a80105-0002-4000-a000-000000000003',
      v_accountant_id,
      '2025-07-01',
      3500000, 2975000, 0,
      2500000,
      FALSE, 'INTAKE-2025-5010002', 'OBJECTION',
      'individual', FALSE
    ),
    (
      -- TAX-003: vg=$2M, disputed=$1.5M → company_trust (threshold=0)
      'c0a80105-0003-4000-a000-000000000004',
      'c0a80105-0003-4000-a000-000000000002',
      'c0a80105-0003-4000-a000-000000000003',
      v_accountant_id,
      '2025-07-01',
      2000000, 1700000, 0,
      1500000,
      FALSE, 'INTAKE-2025-5010003', 'OBJECTION',
      'company_trust', FALSE
    ),
    (
      -- TAX-004: vg=$4M, disputed=$3M → individual, foreign (+4% surcharge)
      'c0a80105-0004-4000-a000-000000000004',
      'c0a80105-0004-4000-a000-000000000002',
      'c0a80105-0004-4000-a000-000000000003',
      v_accountant_id,
      '2025-07-01',
      4000000, 3400000, 0,
      3000000,
      FALSE, 'INTAKE-2025-5010004', 'OBJECTION',
      'individual', TRUE
    ),
    (
      -- TAX-005: vg=$8M, disputed=$7.2M → individual, premium tier
      'c0a80105-0005-4000-a000-000000000004',
      'c0a80105-0005-4000-a000-000000000002',
      'c0a80105-0005-4000-a000-000000000003',
      v_accountant_id,
      '2025-07-01',
      8000000, 6800000, 0,
      7200000,
      FALSE, 'INTAKE-2025-5010005', 'OBJECTION',
      'individual', FALSE
    )
  ON CONFLICT (id) DO UPDATE SET
    assessed_land_value = EXCLUDED.assessed_land_value,
    prior_land_value    = EXCLUDED.prior_land_value,
    appraised_value     = EXCLUDED.appraised_value,
    ownership_type      = EXCLUDED.ownership_type,
    is_foreign          = EXCLUDED.is_foreign,
    notice_reference    = EXCLUDED.notice_reference;

  -- ── Dispute Cases ────────────────────────────────────────────────────────
  -- tax_saving/yml_revenue/client_savings are intentionally NULL — computed by
  -- POST /dispute-cases/:id/calculate-tax, not pre-seeded.
  INSERT INTO dispute_cases
    (id, case_reference, client_id, property_id, valuation_notice_id,
     assigned_accountant_id, jurisdiction, status,
     statutory_deadline, no_legal_ground_flagged, original_assessed_value,
     yml_fee_share_pct, tax_saving, yml_revenue, client_savings)
  VALUES
    (
      -- TAX-001: individual, below threshold → expected tax_saving = $0
      'c0a80105-0001-4000-a000-000000000005',
      'LTD-2026-TAX-001',
      'c0a80105-0001-4000-a000-000000000001',
      'c0a80105-0001-4000-a000-000000000002',
      'c0a80105-0001-4000-a000-000000000004',
      v_accountant_id,
      'NSW', 'appraisal',
      '2025-09-30', FALSE, 900000,
      20, NULL, NULL, NULL
    ),
    (
      -- TAX-002: individual, standard → expected tax_saving = $16,000
      'c0a80105-0002-4000-a000-000000000005',
      'LTD-2026-TAX-002',
      'c0a80105-0002-4000-a000-000000000001',
      'c0a80105-0002-4000-a000-000000000002',
      'c0a80105-0002-4000-a000-000000000004',
      v_accountant_id,
      'NSW', 'appraisal',
      '2025-09-30', FALSE, 3500000,
      20, NULL, NULL, NULL
    ),
    (
      -- TAX-003: company/trust → expected tax_saving = $8,000
      'c0a80105-0003-4000-a000-000000000005',
      'LTD-2026-TAX-003',
      'c0a80105-0003-4000-a000-000000000001',
      'c0a80105-0003-4000-a000-000000000002',
      'c0a80105-0003-4000-a000-000000000004',
      v_accountant_id,
      'NSW', 'appraisal',
      '2025-09-30', FALSE, 2000000,
      20, NULL, NULL, NULL
    ),
    (
      -- TAX-004: foreign individual (+4% surcharge) → expected tax_saving = $56,000
      'c0a80105-0004-4000-a000-000000000005',
      'LTD-2026-TAX-004',
      'c0a80105-0004-4000-a000-000000000001',
      'c0a80105-0004-4000-a000-000000000002',
      'c0a80105-0004-4000-a000-000000000004',
      v_accountant_id,
      'NSW', 'appraisal',
      '2025-09-30', FALSE, 4000000,
      20, NULL, NULL, NULL
    ),
    (
      -- TAX-005: individual, premium tier → expected tax_saving = $16,000
      'c0a80105-0005-4000-a000-000000000005',
      'LTD-2026-TAX-005',
      'c0a80105-0005-4000-a000-000000000001',
      'c0a80105-0005-4000-a000-000000000002',
      'c0a80105-0005-4000-a000-000000000004',
      v_accountant_id,
      'NSW', 'appraisal',
      '2025-09-30', FALSE, 8000000,
      20, NULL, NULL, NULL
    )
  ON CONFLICT (id) DO UPDATE SET
    valuation_notice_id     = EXCLUDED.valuation_notice_id,
    property_id             = EXCLUDED.property_id,
    original_assessed_value = EXCLUDED.original_assessed_value,
    tax_saving              = NULL,
    yml_revenue             = NULL,
    client_savings          = NULL;

  RAISE NOTICE '── Tax savings test cases seeded ──────────────────────────────────────';
  RAISE NOTICE 'LTD-2026-TAX-001 → c0a80105-0001-4000-a000-000000000005  (disputed=$750,000,   expected_tax_saving=$0)';
  RAISE NOTICE 'LTD-2026-TAX-002 → c0a80105-0002-4000-a000-000000000005  (disputed=$2,500,000, expected_tax_saving=$16,000)';
  RAISE NOTICE 'LTD-2026-TAX-003 → c0a80105-0003-4000-a000-000000000005  (disputed=$1,500,000, expected_tax_saving=$8,000)';
  RAISE NOTICE 'LTD-2026-TAX-004 → c0a80105-0004-4000-a000-000000000005  (disputed=$3,000,000, expected_tax_saving=$56,000)';
  RAISE NOTICE 'LTD-2026-TAX-005 → c0a80105-0005-4000-a000-000000000005  (disputed=$7,200,000, expected_tax_saving=$16,000)';

END $$;