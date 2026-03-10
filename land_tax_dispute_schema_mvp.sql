-- ============================================================
-- YML Land Tax Valuation Dispute Module
-- PostgreSQL Schema — MVP (9 tables)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ENUMS ───────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('client', 'accountant', 'lawyer', 'director', 'admin');

CREATE TYPE dispute_status AS ENUM (
  'draft', 'intake', 'grounds_selection', 'evidence_compilation',
  'under_review', 'submitted', 'outcome_received', 'closed'
);

CREATE TYPE legal_ground AS ENUM (
  'incorrect_land_value', 'constraint_oversight',
  'incorrect_area_or_dimensions', 'incorrect_apportionment'
);

CREATE TYPE jurisdiction AS ENUM ('NSW', 'VIC', 'QLD', 'WA');

CREATE TYPE constraint_type AS ENUM (
  'heritage_listing', 'contamination', 'easement', 'flood_zone_100yr',
  'land_subsidence', 'zoning_restriction', 'environmental', 'other'
);

CREATE TYPE outcome_result AS ENUM ('upheld', 'partially_upheld', 'rejected', 'withdrawn');

CREATE TYPE document_type AS ENUM (
  'valuation_notice', 'land_tax_assessment', 'land_title_search',
  'independent_valuation', 'property_report', 'photograph',
  'legal_document', 'generated_objection', 'other'
);

-- ═══════════════════════════════════════════════════════════
-- 1. USERS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT NOT NULL UNIQUE,
  full_name   TEXT NOT NULL,
  role        user_role NOT NULL DEFAULT 'client',
  phone       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- 2. CLIENTS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE clients (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_name          TEXT NOT NULL,
  abn                   TEXT,
  contact_email         TEXT,
  contact_phone         TEXT,
  assigned_accountant_id UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- 3. PROPERTIES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE properties (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  address         TEXT NOT NULL,
  suburb          TEXT NOT NULL,
  state           jurisdiction NOT NULL,
  postcode        TEXT NOT NULL,
  land_area_sqm   NUMERIC(12,2),
  zoning          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- 4. VALUATION NOTICES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE valuation_notices (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id           UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  valuation_date        DATE NOT NULL,
  assessed_land_value   NUMERIC(15,2) NOT NULL,
  benchmark_uplift_pct  NUMERIC(6,3),
  notice_reference      TEXT,
  blob_storage_url      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- 5. DISPUTE CASES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE dispute_cases (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_reference          TEXT UNIQUE NOT NULL,
  client_id               UUID NOT NULL REFERENCES clients(id),
  property_id             UUID NOT NULL REFERENCES properties(id),
  valuation_notice_id     UUID NOT NULL REFERENCES valuation_notices(id),
  assigned_accountant_id  UUID REFERENCES users(id),
  assigned_lawyer_id      UUID REFERENCES users(id),
  jurisdiction            jurisdiction NOT NULL,
  status                  dispute_status NOT NULL DEFAULT 'draft',
  statutory_deadline      DATE NOT NULL,       -- valuation_date + 60 days
  -- Mass appraisal deviation flags (folded in from diagnostic component)
  flag_heritage           BOOLEAN NOT NULL DEFAULT FALSE,
  flag_easement           BOOLEAN NOT NULL DEFAULT FALSE,
  flag_flood_zone         BOOLEAN NOT NULL DEFAULT FALSE,
  flag_environmental      BOOLEAN NOT NULL DEFAULT FALSE,
  flag_zoning             BOOLEAN NOT NULL DEFAULT FALSE,
  -- Scoring & outcome
  evidence_strength_score SMALLINT CHECK (evidence_strength_score BETWEEN 0 AND 100),
  outcome                 outcome_result,
  original_assessed_value NUMERIC(15,2),
  final_agreed_value      NUMERIC(15,2),
  tax_saving_achieved     NUMERIC(15,2),
  notes                   TEXT,
  submitted_at            TIMESTAMPTZ,
  closed_at               TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- 6. LEGAL GROUNDS  (blocks workflow until at least one exists)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE dispute_legal_grounds (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispute_id  UUID NOT NULL REFERENCES dispute_cases(id) ON DELETE CASCADE,
  ground      legal_ground NOT NULL,
  notes       TEXT,
  validated   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dispute_id, ground)
);

-- ═══════════════════════════════════════════════════════════
-- 7. COMPARABLE SALES  (minimum 3 required per dispute)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE comparable_sales (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispute_id            UUID NOT NULL REFERENCES dispute_cases(id) ON DELETE CASCADE,
  property_address      TEXT NOT NULL,
  suburb                TEXT NOT NULL,
  state                 jurisdiction NOT NULL,
  sale_date             DATE NOT NULL,
  sale_price_total      NUMERIC(15,2) NOT NULL,
  improvements_value    NUMERIC(15,2) NOT NULL DEFAULT 0,
  adjusted_land_value   NUMERIC(15,2) GENERATED ALWAYS AS (sale_price_total - improvements_value) STORED,
  land_area_sqm         NUMERIC(12,2),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- 8. SITE CONSTRAINTS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE site_constraints (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispute_id          UUID NOT NULL REFERENCES dispute_cases(id) ON DELETE CASCADE,
  constraint_type     constraint_type NOT NULL,
  description         TEXT,
  legal_argument      TEXT,
  document_blob_url   TEXT,        -- single supporting doc upload
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- 9. DOCUMENTS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE dispute_documents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispute_id        UUID NOT NULL REFERENCES dispute_cases(id) ON DELETE CASCADE,
  document_type     document_type NOT NULL,
  filename          TEXT NOT NULL,
  blob_storage_url  TEXT NOT NULL,
  uploaded_by       UUID REFERENCES users(id),
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INDEXES ─────────────────────────────────────────────────

CREATE INDEX idx_dispute_cases_client     ON dispute_cases(client_id);
CREATE INDEX idx_dispute_cases_status     ON dispute_cases(status);
CREATE INDEX idx_dispute_cases_deadline   ON dispute_cases(statutory_deadline);
CREATE INDEX idx_comparable_sales_dispute ON comparable_sales(dispute_id);
CREATE INDEX idx_documents_dispute        ON dispute_documents(dispute_id);
