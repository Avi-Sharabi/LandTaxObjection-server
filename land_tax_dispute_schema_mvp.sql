-- ============================================================
-- YML Land Tax Valuation Dispute Module
-- PostgreSQL Schema — MVP v4 (12 tables)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ENUMS ───────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM (
  'accountant',
  'admin'
);

CREATE TYPE client_status AS ENUM (
  'prospect',       -- submitted notice, no T&C yet
  'tc_negotiation', -- T&C being discussed
  'active',         -- T&C signed, full client
  'rejected'        -- did not proceed
);

CREATE TYPE dispute_status AS ENUM (
  'draft',
  'grounds_selection',          -- UC-04: accountant selecting legal grounds
  'evidence_compilation',       -- UC-05/06: comparables + constraints
  'appraisal',                  -- UC-07: land valuation appraisal underway
  'advisory_letter_issued',     -- UC-08: VG assessment accurate, no objection
  'objection_package_prepared', -- UC-09: package ready, sent to client
  'awaiting_client_approval',   -- UC-09: waiting on client to sign off
  'submitted_to_vg',            -- UC-10: lodged with Valuer-General
  'awaiting_vg_response',       -- UC-10: no response yet, keep enquiring
  'outcome_received',           -- UC-11: VG responded
  'closed'                      -- UC-11: invoiced and finalised
);

CREATE TYPE legal_ground AS ENUM (
  'incorrect_land_value',
  'constraint_oversight',
  'incorrect_area_or_dimensions',
  'incorrect_apportionment'
);

CREATE TYPE jurisdiction AS ENUM ('NSW', 'VIC', 'QLD', 'WA');

CREATE TYPE constraint_type AS ENUM (
  -- Physical/legal property constraints (UC-06, site_constraints)
  'heritage_listing',
  'flood_zone_100yr',
  'bushfire_bal_restriction',
  'easement_or_right_of_way',
  'environmental_conservation_overlay',
  'zoning_planning_restriction',
  'access_restriction_landlocked',
  'contamination_remediation',
  -- Evidence folder categories (dispute_constraints / constraint_files)
  'comparable_sales',
  'market_value',
  'land_use',
  'other'
);

CREATE TYPE outcome_result AS ENUM (
  'upheld',
  'partially_upheld',
  'rejected',
  'withdrawn'
);

CREATE TYPE document_type AS ENUM (
  'valuation_notice',
  'land_tax_assessment',
  'land_title_search',
  'independent_valuation',
  'property_report',
  'photograph',
  'legal_document',
  'generated_objection',
  'advisory_letter',
  'other'
);

CREATE TYPE upload_status AS ENUM (
  'pending',
  'scanning',
  'complete',
  'failed',
  'rejected'
);

CREATE TYPE uploaded_by_role AS ENUM (
  'client',
  'staff',
  'staff_on_behalf_of_client'
);

-- ═══════════════════════════════════════════════════════════
-- 1. USERS  (YML internal staff)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE users (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT        NOT NULL UNIQUE,
  full_name   TEXT        NOT NULL,
  role        user_role   NOT NULL DEFAULT 'accountant',
  phone       TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- 2. CLIENTS  (prospects + active clients in one table)
-- ═══════════════════════════════════════════════════════════


CREATE TABLE clients (
  -- Core
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status                 client_status NOT NULL DEFAULT 'prospect',

  -- Identity
  name                   TEXT NOT NULL,
  email                  TEXT,
  phone                  TEXT,
  mobile                 TEXT,

  -- Address
  address                TEXT,
  city                   TEXT,
  region                 TEXT,
  postcode               TEXT,
  country                TEXT,

  -- Business
  business_number        TEXT,
  company_number         TEXT,
  client_code            TEXT,
  source                 TEXT,
  source_id              TEXT,

  -- FYI Metadata
  fyi_id                 TEXT,
  fyi_uuid               TEXT,
  fyi_manager_email      TEXT,
  fyi_partner_email      TEXT,

  -- Internal
  assigned_accountant_id UUID REFERENCES users(id) ON DELETE SET NULL,
  tc_accepted_at         TIMESTAMPTZ,

  -- Timestamps
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 3. PROPERTIES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE properties (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       UUID         NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  address         TEXT         NOT NULL,
  suburb          TEXT         NOT NULL,
  state           jurisdiction NOT NULL,
  postcode        TEXT         NOT NULL,
  land_area_sqm   NUMERIC(12,2),
  zoning          TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- 4. VALUATION NOTICES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE valuation_notices (
  id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id           UUID         NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  valuation_date        DATE         NOT NULL,
  assessed_land_value   NUMERIC(15,2) NOT NULL,
  benchmark_uplift_pct  NUMERIC(6,3),
  notice_reference      TEXT,
  blob_storage_url      TEXT,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- 4b. VALUATION NOTICE FILES  (multi-file upload with scan status)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE valuation_notice_files (
  id                  UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
  valuation_notice_id UUID             NOT NULL REFERENCES valuation_notices(id) ON DELETE CASCADE,
  blob_path           TEXT             NOT NULL,
  original_name       TEXT             NOT NULL,
  mime_type           TEXT             NOT NULL,
  file_size_bytes     INT              NOT NULL,
  upload_status       upload_status    NOT NULL DEFAULT 'pending',
  uploaded_by         UUID             NOT NULL REFERENCES users(id),
  uploaded_by_role    uploaded_by_role NOT NULL,
  confirmed_by        UUID             REFERENCES users(id),
  confirmed_at        TIMESTAMPTZ,
  uploaded_at         TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- 5. DISPUTE CASES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE dispute_cases (
  id                            UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_reference                TEXT           UNIQUE NOT NULL,
  client_id                     UUID           NOT NULL REFERENCES clients(id),
  property_id                   UUID           NOT NULL REFERENCES properties(id),
  valuation_notice_id           UUID           NOT NULL REFERENCES valuation_notices(id),
  assigned_accountant_id        UUID           REFERENCES users(id),
  assigned_lawyer_id            UUID           REFERENCES users(id),
  jurisdiction                  jurisdiction   NOT NULL,
  status                        dispute_status NOT NULL DEFAULT 'draft',
  statutory_deadline            DATE           NOT NULL,  -- valuation_date + 60 days
  no_legal_ground_flagged       BOOLEAN        NOT NULL DEFAULT FALSE,
  -- Client approval tracking (UC-09)
  client_approval_requested_at  TIMESTAMPTZ,
  client_approved_at            TIMESTAMPTZ,
  -- Mass appraisal deviation flags
  flag_heritage                 BOOLEAN        NOT NULL DEFAULT FALSE,
  flag_easement                 BOOLEAN        NOT NULL DEFAULT FALSE,
  flag_flood_zone               BOOLEAN        NOT NULL DEFAULT FALSE,
  flag_environmental            BOOLEAN        NOT NULL DEFAULT FALSE,
  flag_zoning                   BOOLEAN        NOT NULL DEFAULT FALSE,
  -- Scoring & outcome
  evidence_strength_score       SMALLINT       CHECK (evidence_strength_score BETWEEN 0 AND 100),
  outcome                       outcome_result,
  original_assessed_value       NUMERIC(15,2),
  final_agreed_value            NUMERIC(15,2),
  tax_saving_achieved           NUMERIC(15,2),
  invoice_amount                NUMERIC(15,2), -- UC-11: 30-40% share of saving
  notes                         TEXT,
  submitted_at                  TIMESTAMPTZ,
  closed_at                     TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- 6. LEGAL GROUNDS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE dispute_legal_grounds (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispute_id  UUID        NOT NULL REFERENCES dispute_cases(id) ON DELETE CASCADE,
  ground      legal_ground NOT NULL,
  notes       TEXT,
  validated   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dispute_id, ground)
);

-- ═══════════════════════════════════════════════════════════
-- 7. COMPARABLE SALES  (minimum 3 per dispute — UC-05)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE comparable_sales (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispute_id          UUID         NOT NULL REFERENCES dispute_cases(id) ON DELETE CASCADE,
  property_address    TEXT         NOT NULL,
  suburb              TEXT         NOT NULL,
  state               jurisdiction NOT NULL,
  sale_date           DATE         NOT NULL,
  sale_price_total    NUMERIC(15,2) NOT NULL,
  improvements_value  NUMERIC(15,2) NOT NULL DEFAULT 0,
  adjusted_land_value NUMERIC(15,2) GENERATED ALWAYS AS (sale_price_total - improvements_value) STORED,
  land_area_sqm       NUMERIC(12,2),
  notes               TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- 8. SITE CONSTRAINTS  (UC-06)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE site_constraints (
  id                UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispute_id        UUID            NOT NULL REFERENCES dispute_cases(id) ON DELETE CASCADE,
  constraint_type   constraint_type NOT NULL,
  description       TEXT,
  legal_argument    TEXT,
  document_blob_url TEXT,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- 9. DOCUMENTS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE dispute_documents (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispute_id        UUID          NOT NULL REFERENCES dispute_cases(id) ON DELETE CASCADE,
  document_type     document_type NOT NULL,
  filename          TEXT          NOT NULL,
  blob_storage_url  TEXT          NOT NULL,
  uploaded_by       UUID          REFERENCES users(id),
  uploaded_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- 10. DISPUTE CONSTRAINTS  (evidence folders per dispute — UC-06)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE dispute_constraints (
  id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispute_id      UUID            NOT NULL REFERENCES dispute_cases(id) ON DELETE CASCADE,
  constraint_type constraint_type NOT NULL,
  description     TEXT,
  disputed_value  NUMERIC(15,2),
  sort_order      INT             NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- 11. CONSTRAINT FILES  (files within each evidence folder)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE constraint_files (
  id                    UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
  dispute_constraint_id UUID             NOT NULL REFERENCES dispute_constraints(id) ON DELETE CASCADE,
  document_category     constraint_type  NOT NULL,
  blob_path             TEXT             NOT NULL,
  original_name         TEXT             NOT NULL,
  mime_type             TEXT             NOT NULL,
  file_size_bytes       INT              NOT NULL,
  upload_status         upload_status    NOT NULL DEFAULT 'pending',
  uploaded_by           UUID             NOT NULL REFERENCES users(id),
  uploaded_by_role      uploaded_by_role NOT NULL,
  confirmed_by          UUID             REFERENCES users(id),
  confirmed_at          TIMESTAMPTZ,
  uploaded_at           TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- ── INDEXES ─────────────────────────────────────────────────

CREATE INDEX idx_clients_status                 ON clients(status);
CREATE INDEX idx_clients_email                  ON clients(email);
CREATE INDEX idx_clients_accountant             ON clients(assigned_accountant_id);
CREATE INDEX idx_dispute_cases_client           ON dispute_cases(client_id);
CREATE INDEX idx_dispute_cases_status           ON dispute_cases(status);
CREATE INDEX idx_dispute_cases_deadline         ON dispute_cases(statutory_deadline);
CREATE INDEX idx_comparable_sales_dispute       ON comparable_sales(dispute_id);
CREATE INDEX idx_documents_dispute              ON dispute_documents(dispute_id);
CREATE INDEX idx_valuation_notice_files_notice  ON valuation_notice_files(valuation_notice_id);
CREATE INDEX idx_valuation_notice_files_status  ON valuation_notice_files(upload_status);
CREATE INDEX idx_dispute_constraints_dispute    ON dispute_constraints(dispute_id);
CREATE INDEX idx_constraint_files_constraint    ON constraint_files(dispute_constraint_id);
CREATE INDEX idx_constraint_files_status        ON constraint_files(upload_status);
