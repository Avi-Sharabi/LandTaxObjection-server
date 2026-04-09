-- ============================================================
--  Land Tax Dispute — full schema (consolidated from migrations)
--  Generated: 2026-04-06
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Enum types ───────────────────────────────────────────────

CREATE TYPE "users_role_enum" AS ENUM (
  'accountant', 'admin', 'Internal Assessor'
);

CREATE TYPE "clients_status_enum" AS ENUM (
  'prospect', 'tc_negotiation', 'active', 'rejected'
);

CREATE TYPE "properties_state_enum" AS ENUM (
  'NSW', 'VIC', 'QLD', 'WA'
);

CREATE TYPE "dispute_cases_jurisdiction_enum" AS ENUM (
  'NSW', 'VIC', 'QLD', 'WA'
);

CREATE TYPE "dispute_cases_status_enum" AS ENUM (
  'draft',
  'grounds_selection',
  'evidence_compilation',
  'appraisal',
  'advisory_letter_issued',
  'objection_package_prepared',
  'awaiting_client_approval',
  'client_approved',
  'submitted_to_vg',
  'awaiting_vg_response',
  'outcome_received',
  'closed',
  'closed_no_objection'
);

CREATE TYPE "dispute_cases_outcome_enum" AS ENUM (
  'upheld', 'partially_upheld', 'rejected', 'withdrawn'
);

CREATE TYPE "dispute_legal_grounds_ground_enum" AS ENUM (
  'incorrect_land_value',
  'constraint_oversight',
  'incorrect_area_or_dimensions',
  'incorrect_apportionment',
  'not_sure'
);

CREATE TYPE "valuation_notices_decision_outcome_enum" AS ENUM (
  'OBJECTION', 'ADVISORY'
);

CREATE TYPE "upload_status_enum" AS ENUM (
  'pending', 'scanning', 'complete', 'failed', 'rejected'
);

CREATE TYPE "uploaded_by_role_enum" AS ENUM (
  'client', 'staff', 'staff_on_behalf_of_client'
);

CREATE TYPE "dispute_constraints_constraint_type_enum" AS ENUM (
  'heritage_listing',
  'flood_zone_100yr',
  'bushfire_bal_restriction',
  'easement_or_right_of_way',
  'environmental_conservation_overlay',
  'zoning_planning_restriction',
  'access_restriction_landlocked',
  'contamination_remediation',
  'comparable_sales',
  'market_value',
  'land_use',
  'other'
);

CREATE TYPE "constraint_files_document_category_enum" AS ENUM (
  'heritage_listing',
  'flood_zone_100yr',
  'bushfire_bal_restriction',
  'easement_or_right_of_way',
  'environmental_conservation_overlay',
  'zoning_planning_restriction',
  'access_restriction_landlocked',
  'contamination_remediation',
  'comparable_sales',
  'market_value',
  'land_use',
  'other'
);

CREATE TYPE "dispute_documents_document_type_enum" AS ENUM (
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

CREATE TYPE "package_document_category_enum" AS ENUM (
  'notice_of_objection',
  'comparable_sales_report',
  'mass_appraisal_deviation_report',
  'site_constraints_summary',
  'supporting_uploads'
);

CREATE TYPE "package_document_status_enum" AS ENUM (
  'ready', 'missing', 'pending'
);

-- ── users ────────────────────────────────────────────────────

CREATE TABLE "users" (
  "id"         uuid                 NOT NULL DEFAULT uuid_generate_v4(),
  "email"      text                 NOT NULL,
  "full_name"  text                 NOT NULL,
  "role"       "users_role_enum"    NOT NULL DEFAULT 'accountant',
  "phone"      text,
  "password"   text,
  "is_active"  boolean              NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ          NOT NULL DEFAULT now(),
  CONSTRAINT "PK_users" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_users_email" UNIQUE ("email")
);

-- ── clients ──────────────────────────────────────────────────

CREATE TABLE "clients" (
  "id"                      uuid                    NOT NULL DEFAULT uuid_generate_v4(),
  "status"                  "clients_status_enum"   NOT NULL DEFAULT 'prospect',
  "name"                    text                    NOT NULL,
  "email"                   text,
  "phone"                   text,
  "address"                 text,
  "city"                    text,
  "region"                  text,
  "postcode"                text,
  "country"                 text,
  "business_number"         text,
  "company_number"          text,
  "source"                  text,
  "assigned_accountant_id"  uuid,
  "tc_accepted_at"          TIMESTAMPTZ,
  "created_at"              TIMESTAMPTZ             NOT NULL DEFAULT now(),
  "updated_at"              TIMESTAMPTZ             NOT NULL DEFAULT now(),
  -- XPM fields
  "title"                   text,
  "gender"                  text,
  "first_name"              text,
  "middle_name"             text,
  "last_name"               text,
  "fax"                     text,
  "website"                 text,
  "date_of_birth"           date,
  "postal_address"          text,
  "postal_city"             text,
  "postal_region"           text,
  "postal_postcode"         text,
  "postal_country"          text,
  "tax_number"              text,
  "business_structure"      text,
  "tax_agent"               text,
  "agency_status"           text,
  "referral_source"         text,
  "xpm_account_manager_uuid" text,
  "xpm_account_manager_name" text,
  "xpm_job_manager_uuid"    text,
  "xpm_job_manager_name"    text,
  "xpm_uuid"                text,
  CONSTRAINT "PK_clients" PRIMARY KEY ("id"),
  CONSTRAINT "FK_clients_assigned_accountant"
    FOREIGN KEY ("assigned_accountant_id") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- ── properties ───────────────────────────────────────────────

CREATE TABLE "properties" (
  "id"            uuid                    NOT NULL DEFAULT uuid_generate_v4(),
  "client_id"     uuid                    NOT NULL,
  "address"       text                    NOT NULL,
  "suburb"        text                    NOT NULL,
  "state"         "properties_state_enum" NOT NULL,
  "postcode"      text                    NOT NULL,
  "ownership_pct" NUMERIC(5,2),
  "land_area_sqm" NUMERIC(12,2),
  "zoning"        text,
  "pid"           text,
  "created_at"    TIMESTAMPTZ             NOT NULL DEFAULT now(),
  CONSTRAINT "PK_properties" PRIMARY KEY ("id"),
  CONSTRAINT "FK_properties_client"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

-- ── assessment_documents ─────────────────────────────────────

CREATE TABLE "assessment_documents" (
  "id"             uuid        NOT NULL DEFAULT uuid_generate_v4(),
  "client_id"      uuid        NOT NULL,
  "file_path"      text,
  "notice_date"    date        NOT NULL,
  "valuation_year" text        NOT NULL,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_assessment_documents" PRIMARY KEY ("id"),
  CONSTRAINT "FK_assessment_documents_client"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

-- ── valuation_notices ────────────────────────────────────────

CREATE TABLE "valuation_notices" (
  "id"                   uuid                                       NOT NULL DEFAULT uuid_generate_v4(),
  "property_id"          uuid                                       NOT NULL,
  "valuation_date"       date                                       NOT NULL,
  "assessed_land_value"  NUMERIC(15,2),
  "benchmark_uplift_pct" NUMERIC(6,3),
  "notice_reference"     text,
  "source_document_id"   uuid,
  "appraised_value"      NUMERIC(15,2),
  "valuation_delta"      NUMERIC(15,2),
  "decision_outcome"     "valuation_notices_decision_outcome_enum",
  "analyst_notes"        text,
  "appraised_by_id"      uuid,
  "appraised_at"         TIMESTAMPTZ,
  "is_exempt"            boolean                                    NOT NULL DEFAULT false,
  "created_at"           TIMESTAMPTZ                                NOT NULL DEFAULT now(),
  CONSTRAINT "PK_valuation_notices" PRIMARY KEY ("id"),
  CONSTRAINT "FK_valuation_notices_property"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "FK_valuation_notices_source_document"
    FOREIGN KEY ("source_document_id") REFERENCES "assessment_documents"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "FK_valuation_notices_appraised_by"
    FOREIGN KEY ("appraised_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION
);

-- ── valuation_notice_files ───────────────────────────────────

CREATE TABLE "valuation_notice_files" (
  "id"                  uuid                      NOT NULL DEFAULT uuid_generate_v4(),
  "valuation_notice_id" uuid                      NOT NULL,
  "blob_path"           text                      NOT NULL,
  "original_name"       text                      NOT NULL,
  "mime_type"           text                      NOT NULL,
  "file_size_bytes"     integer                   NOT NULL,
  "upload_status"       "upload_status_enum"      NOT NULL DEFAULT 'pending',
  "uploaded_by"         uuid                      NOT NULL,
  "uploaded_by_role"    "uploaded_by_role_enum"   NOT NULL,
  "confirmed_by"        uuid,
  "confirmed_at"        TIMESTAMPTZ,
  "uploaded_at"         TIMESTAMPTZ               NOT NULL DEFAULT now(),
  CONSTRAINT "PK_valuation_notice_files" PRIMARY KEY ("id"),
  CONSTRAINT "FK_valuation_notice_files_notice"
    FOREIGN KEY ("valuation_notice_id") REFERENCES "valuation_notices"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "FK_valuation_notice_files_uploader"
    FOREIGN KEY ("uploaded_by") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "FK_valuation_notice_files_confirmer"
    FOREIGN KEY ("confirmed_by") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "IDX_valuation_notice_files_notice"  ON "valuation_notice_files" ("valuation_notice_id");
CREATE INDEX "IDX_valuation_notice_files_status"  ON "valuation_notice_files" ("upload_status");

-- ── dispute_cases ────────────────────────────────────────────

CREATE TABLE "dispute_cases" (
  "id"                               uuid                           NOT NULL DEFAULT uuid_generate_v4(),
  "case_reference"                   text                           NOT NULL,
  "client_id"                        uuid                           NOT NULL,
  "property_id"                      uuid                           NOT NULL,
  "valuation_notice_id"              uuid                           NOT NULL,
  "assigned_accountant_id"           uuid,
  "assigned_lawyer_id"               uuid,
  "jurisdiction"                     "dispute_cases_jurisdiction_enum" NOT NULL,
  "status"                           "dispute_cases_status_enum"    NOT NULL DEFAULT 'draft',
  "statutory_deadline"               date                           NOT NULL,
  "no_legal_ground_flagged"          boolean                        NOT NULL DEFAULT false,
  "client_approval_requested_at"     TIMESTAMPTZ,
  "client_approved_at"               TIMESTAMPTZ,
  "client_approval_token"            uuid,
  "client_approval_token_expires_at" TIMESTAMPTZ,
  "last_reminder_sent_at"            TIMESTAMPTZ,
  "reminder_count"                   smallint                       NOT NULL DEFAULT 0,
  "flag_heritage"                    boolean                        NOT NULL DEFAULT false,
  "flag_easement"                    boolean                        NOT NULL DEFAULT false,
  "flag_flood_zone"                  boolean                        NOT NULL DEFAULT false,
  "flag_environmental"               boolean                        NOT NULL DEFAULT false,
  "flag_zoning"                      boolean                        NOT NULL DEFAULT false,
  "evidence_strength_score"          smallint,
  "outcome"                          "dispute_cases_outcome_enum",
  "invoice_amount"                   NUMERIC(15,2),
  "original_assessed_value"          NUMERIC(15,2),
  "final_agreed_value"               NUMERIC(15,2),
  "tax_saving_achieved"              NUMERIC(15,2),
  "notes"                            text,
  "submitted_at"                     TIMESTAMPTZ,
  "closed_at"                        TIMESTAMPTZ,
  "created_at"                       TIMESTAMPTZ                    NOT NULL DEFAULT now(),
  "updated_at"                       TIMESTAMPTZ                    NOT NULL DEFAULT now(),
  CONSTRAINT "PK_dispute_cases" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_dispute_cases_case_reference" UNIQUE ("case_reference"),
  CONSTRAINT "FK_dispute_cases_client"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "FK_dispute_cases_property"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "FK_dispute_cases_valuation_notice"
    FOREIGN KEY ("valuation_notice_id") REFERENCES "valuation_notices"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "FK_dispute_cases_accountant"
    FOREIGN KEY ("assigned_accountant_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "FK_dispute_cases_lawyer"
    FOREIGN KEY ("assigned_lawyer_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- ── dispute_legal_grounds ────────────────────────────────────

CREATE TABLE "dispute_legal_grounds" (
  "id"         uuid                                  NOT NULL DEFAULT uuid_generate_v4(),
  "dispute_id" uuid                                  NOT NULL,
  "ground"     "dispute_legal_grounds_ground_enum"   NOT NULL,
  "notes"      text,
  "validated"  boolean                               NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ                           NOT NULL DEFAULT now(),
  CONSTRAINT "PK_dispute_legal_grounds" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_dispute_legal_grounds_dispute_ground" UNIQUE ("dispute_id", "ground"),
  CONSTRAINT "FK_dispute_legal_grounds_dispute"
    FOREIGN KEY ("dispute_id") REFERENCES "dispute_cases"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

-- ── comparable_sales ─────────────────────────────────────────

CREATE TABLE "comparable_sales" (
  "id"                           uuid        NOT NULL DEFAULT uuid_generate_v4(),
  "dispute_case_id"              uuid        NOT NULL,
  "address"                      text        NOT NULL,
  "sale_date"                    date        NOT NULL,
  "sale_price"                   NUMERIC(15,2) NOT NULL,
  "estimated_improvements_value" NUMERIC(15,2) NOT NULL,
  "adjusted_land_value"          NUMERIC(15,2) NOT NULL,
  "land_area_sqm"                NUMERIC(10,2),
  "notes"                        text,
  "created_by_id"                uuid        NOT NULL,
  "created_at"                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_comparable_sales" PRIMARY KEY ("id"),
  CONSTRAINT "FK_comparable_sales_dispute"
    FOREIGN KEY ("dispute_case_id") REFERENCES "dispute_cases"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "FK_comparable_sales_created_by"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- ── dispute_constraints ──────────────────────────────────────

CREATE TABLE "dispute_constraints" (
  "id"              uuid                                        NOT NULL DEFAULT uuid_generate_v4(),
  "dispute_id"      uuid                                        NOT NULL,
  "constraint_type" "dispute_constraints_constraint_type_enum" NOT NULL,
  "description"     text,
  "created_at"      TIMESTAMPTZ                                 NOT NULL DEFAULT now(),
  CONSTRAINT "PK_dispute_constraints" PRIMARY KEY ("id"),
  CONSTRAINT "FK_dispute_constraints_dispute"
    FOREIGN KEY ("dispute_id") REFERENCES "dispute_cases"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX "IDX_dispute_constraints_dispute" ON "dispute_constraints" ("dispute_id");

-- ── constraint_files ─────────────────────────────────────────

CREATE TABLE "constraint_files" (
  "id"                    uuid                                       NOT NULL DEFAULT uuid_generate_v4(),
  "dispute_constraint_id" uuid                                       NOT NULL,
  "document_category"     "constraint_files_document_category_enum" NOT NULL,
  "blob_path"             text                                       NOT NULL,
  "original_name"         text                                       NOT NULL,
  "file_size_bytes"       integer                                    NOT NULL,
  "upload_status"         "upload_status_enum"                       NOT NULL DEFAULT 'pending',
  "uploaded_by"           uuid                                       NOT NULL,
  "uploaded_by_role"      "uploaded_by_role_enum"                    NOT NULL,
  "confirmed_by"          uuid,
  "confirmed_at"          TIMESTAMPTZ,
  "uploaded_at"           TIMESTAMPTZ                                NOT NULL DEFAULT now(),
  CONSTRAINT "PK_constraint_files" PRIMARY KEY ("id"),
  CONSTRAINT "FK_constraint_files_dispute_constraint"
    FOREIGN KEY ("dispute_constraint_id") REFERENCES "dispute_constraints"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "FK_constraint_files_uploader"
    FOREIGN KEY ("uploaded_by") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "FK_constraint_files_confirmer"
    FOREIGN KEY ("confirmed_by") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "IDX_constraint_files_constraint" ON "constraint_files" ("dispute_constraint_id");
CREATE INDEX "IDX_constraint_files_status"     ON "constraint_files" ("upload_status");

-- ── dispute_documents ────────────────────────────────────────

CREATE TABLE "dispute_documents" (
  "id"               uuid                                    NOT NULL DEFAULT uuid_generate_v4(),
  "dispute_id
Now I have all migrations. Let me generate the consolidated SQL.


-- ============================================================
-- Land Tax Dispute — Full Schema (PostgreSQL)
-- Generated from migrations 1773800000000 → 1775700000000
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE "users_role_enum" AS ENUM (
  'accountant', 'admin', 'Internal Assessor'
);

CREATE TYPE "clients_status_enum" AS ENUM (
  'prospect', 'tc_negotiation', 'active', 'rejected'
);

CREATE TYPE "properties_state_enum" AS ENUM (
  'NSW', 'VIC', 'QLD', 'WA'
);

CREATE TYPE "dispute_cases_jurisdiction_enum" AS ENUM (
  'NSW', 'VIC', 'QLD', 'WA'
);

-- Includes all values added across migrations
CREATE TYPE "dispute_cases_status_enum" AS ENUM (
  'draft',
  'grounds_selection',
  'evidence_compilation',
  'appraisal',
  'advisory_letter_issued',
  'objection_package_prepared',
  'awaiting_client_approval',
  'client_approved',
  'submitted_to_vg',
  'awaiting_vg_response',
  'outcome_received',
  'closed',
  'closed_no_objection'
);

CREATE TYPE "dispute_cases_outcome_enum" AS ENUM (
  'upheld', 'partially_upheld', 'rejected', 'withdrawn'
);

CREATE TYPE "dispute_legal_grounds_ground_enum" AS ENUM (
  'incorrect_land_value',
  'constraint_oversight',
  'incorrect_area_or_dimensions',
  'incorrect_apportionment',
  'not_sure'
);

CREATE TYPE "valuation_notices_decision_outcome_enum" AS ENUM (
  'OBJECTION', 'ADVISORY'
);

CREATE TYPE "upload_status_enum" AS ENUM (
  'pending', 'scanning', 'complete', 'failed', 'rejected'
);

CREATE TYPE "uploaded_by_role_enum" AS ENUM (
  'client', 'staff', 'staff_on_behalf_of_client'
);

CREATE TYPE "dispute_constraints_constraint_type_enum" AS ENUM (
  'heritage_listing',
  'flood_zone_100yr',
  'bushfire_bal_restriction',
  'easement_or_right_of_way',
  'environmental_conservation_overlay',
  'zoning_planning_restriction',
  'access_restriction_landlocked',
  'contamination_remediation',
  'comparable_sales',
  'market_value',
  'land_use',
  'other'
);

CREATE TYPE "constraint_files_document_category_enum" AS ENUM (
  'heritage_listing',
  'flood_zone_100yr',
  'bushfire_bal_restriction',
  'easement_or_right_of_way',
  'environmental_conservation_overlay',
  'zoning_planning_restriction',
  'access_restriction_landlocked',
  'contamination_remediation',
  'comparable_sales',
  'market_value',
  'land_use',
  'other'
);

CREATE TYPE "dispute_documents_document_type_enum" AS ENUM (
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

CREATE TYPE "package_document_category_enum" AS ENUM (
  'notice_of_objection',
  'comparable_sales_report',
  'mass_appraisal_deviation_report',
  'site_constraints_summary',
  'supporting_uploads'
);

CREATE TYPE "package_document_status_enum" AS ENUM (
  'ready', 'missing', 'pending'
);

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE "users" (
  "id"         uuid        NOT NULL DEFAULT uuid_generate_v4(),
  "email"      text        NOT NULL,
  "full_name"  text        NOT NULL,
  "role"       "users_role_enum" NOT NULL DEFAULT 'accountant',
  "phone"      text,
  "password"   text,
  "is_active"  boolean     NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_users" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_users_email" UNIQUE ("email")
);

-- ------------------------------------------------------------

CREATE TABLE "clients" (
  "id"                      uuid                  NOT NULL DEFAULT uuid_generate_v4(),
  "status"                  "clients_status_enum" NOT NULL DEFAULT 'prospect',
  "name"                    text                  NOT NULL,
  "email"                   text,
  "phone"                   text,
  "address"                 text,
  "city"                    text,
  "region"                  text,
  "postcode"                text,
  "country"                 text,
  "business_number"         text,
  "company_number"          text,
  "source"                  text,
  "assigned_accountant_id"  uuid,
  "tc_accepted_at"          TIMESTAMPTZ,
  "created_at"              TIMESTAMPTZ           NOT NULL DEFAULT now(),
  "updated_at"              TIMESTAMPTZ           NOT NULL DEFAULT now(),
  -- XPM fields (added via migrations)
  "title"                   text,
  "gender"                  text,
  "first_name"              text,
  "middle_name"             text,
  "last_name"               text,
  "fax"                     text,
  "website"                 text,
  "date_of_birth"           date,
  "postal_address"          text,
  "postal_city"             text,
  "postal_region"           text,
  "postal_postcode"         text,
  "postal_country"          text,
  "tax_number"              text,
  "business_structure"      text,
  "tax_agent"               text,
  "agency_status"           text,
  "referral_source"         text,
  "xpm_account_manager_uuid" text,
  "xpm_account_manager_name" text,
  "xpm_job_manager_uuid"    text,
  "xpm_job_manager_name"    text,
  "xpm_uuid"                text,
  CONSTRAINT "PK_clients" PRIMARY KEY ("id"),
  CONSTRAINT "FK_clients_assigned_accountant"
    FOREIGN KEY ("assigned_accountant_id") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- ------------------------------------------------------------

CREATE TABLE "properties" (
  "id"            uuid                     NOT NULL DEFAULT uuid_generate_v4(),
  "client_id"     uuid                     NOT NULL,
  "address"       text                     NOT NULL,
  "suburb"        text                     NOT NULL,
  "state"         "properties_state_enum"  NOT NULL,
  "postcode"      text                     NOT NULL,
  "ownership_pct" NUMERIC(5,2),
  "land_area_sqm" NUMERIC(12,2),
  "zoning"        text,
  "pid"           text,
  "created_at"    TIMESTAMPTZ              NOT NULL DEFAULT now(),
  CONSTRAINT "PK_properties" PRIMARY KEY ("id"),
  CONSTRAINT "FK_properties_client"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

-- ------------------------------------------------------------

CREATE TABLE "assessment_documents" (
  "id"             uuid        NOT NULL DEFAULT uuid_generate_v4(),
  "client_id"      uuid        NOT NULL,
  "file_path"      text,
  "notice_date"    date        NOT NULL,
  "valuation_year" text        NOT NULL,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_assessment_documents" PRIMARY KEY ("id"),
  CONSTRAINT "FK_assessment_documents_client"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

-- ------------------------------------------------------------

CREATE TABLE "valuation_notices" (
  "id"                   uuid                                     NOT NULL DEFAULT uuid_generate_v4(),
  "property_id"          uuid                                     NOT NULL,
  "valuation_date"       date                                     NOT NULL,
  "assessed_land_value"  NUMERIC(15,2),                          -- nullable after migration
  "benchmark_uplift_pct" NUMERIC(6,3),
  "notice_reference"     text,
  "source_document_id"   uuid,
  "appraised_value"      NUMERIC(15,2),
  "valuation_delta"      NUMERIC(15,2),
  "decision_outcome"     "valuation_notices_decision_outcome_enum",
  "analyst_notes"        text,
  "appraised_by_id"      uuid,
  "appraised_at"         TIMESTAMPTZ,
  "is_exempt"            boolean                                  NOT NULL DEFAULT false,
  "created_at"           TIMESTAMPTZ                              NOT NULL DEFAULT now(),
  CONSTRAINT "PK_valuation_notices" PRIMARY KEY ("id"),
  CONSTRAINT "FK_valuation_notices_property"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "FK_valuation_notices_source_document"
    FOREIGN KEY ("source_document_id") REFERENCES "assessment_documents"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "FK_valuation_notices_appraised_by"
    FOREIGN KEY ("appraised_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION
);

-- ------------------------------------------------------------

CREATE TABLE "valuation_notice_files" (
  "id"                  uuid                      NOT NULL DEFAULT uuid_generate_v4(),
  "valuation_notice_id" uuid                      NOT NULL,
  "blob_path"           text                      NOT NULL,
  "original_name"       text                      NOT NULL,
  "mime_type"           text                      NOT NULL,
  "file_size_bytes"     integer                   NOT NULL,
  "upload_status"       "upload_status_enum"      NOT NULL DEFAULT 'pending',
  "uploaded_by"         uuid                      NOT NULL,
  "uploaded_by_role"    "uploaded_by_role_enum"   NOT NULL,
  "confirmed_by"        uuid,
  "confirmed_at"        TIMESTAMPTZ,
  "uploaded_at"         TIMESTAMPTZ               NOT NULL DEFAULT now(),
  CONSTRAINT "PK_valuation_notice_files" PRIMARY KEY ("id"),
  CONSTRAINT "FK_valuation_notice_files_notice"
    FOREIGN KEY ("valuation_notice_id") REFERENCES "valuation_notices"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "FK_valuation_notice_files_uploader"
    FOREIGN KEY ("uploaded_by") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "FK_valuation_notice_files_confirmer"
    FOREIGN KEY ("confirmed_by") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "IDX_valuation_notice_files_notice"  ON "valuation_notice_files" ("valuation_notice_id");
CREATE INDEX "IDX_valuation_notice_files_status"  ON "valuation_notice_files" ("upload_status");

-- ------------------------------------------------------------

CREATE TABLE "dispute_cases" (
  "id"                              uuid                            NOT NULL DEFAULT uuid_generate_v4(),
  "case_reference"                  text                            NOT NULL,
  "client_id"                       uuid                            NOT NULL,
  "property_id"                     uuid                            NOT NULL,
  "valuation_notice_id"             uuid                            NOT NULL,
  "assigned_accountant_id"          uuid,
  "assigned_lawyer_id"              uuid,
  "jurisdiction"                    "dispute_cases_jurisdiction_enum" NOT NULL,
  "status"                          "dispute_cases_status_enum"     NOT NULL DEFAULT 'draft',
  "statutory_deadline"              date                            NOT NULL,
  "no_legal_ground_flagged"         boolean                         NOT NULL DEFAULT false,
  "client_approval_requested_at"    TIMESTAMPTZ,
  "client_approved_at"              TIMESTAMPTZ,
  "client_approval_token"           uuid,
  "client_approval_token_expires_at" TIMESTAMPTZ,
  "last_reminder_sent_at"           TIMESTAMPTZ,
  "reminder_count"                  smallint                        NOT NULL DEFAULT 0,
  "flag_heritage"                   boolean                         NOT NULL DEFAULT false,
  "flag_easement"                   boolean                         NOT NULL DEFAULT false,
  "flag_flood_zone"                 boolean                         NOT NULL DEFAULT false,
  "flag_environmental"              boolean                         NOT NULL DEFAULT false,
  "flag_zoning"                     boolean                         NOT NULL DEFAULT false,
  "evidence_strength_score"         smallint,
  "outcome"                         "dispute_cases_outcome_enum",
  "invoice_amount"                  NUMERIC(15,2),
  "original_assessed_value"         NUMERIC(15,2),
  "final_agreed_value"              NUMERIC(15,2),
  "tax_saving_achieved"             NUMERIC(15,2),
  "notes"                           text,
  "submitted_at"                    TIMESTAMPTZ,
  "closed_at"                       TIMESTAMPTZ,
  "created_at"                      TIMESTAMPTZ                     NOT NULL DEFAULT now(),
  "updated_at"                      TIMESTAMPTZ                     NOT NULL DEFAULT now(),
  CONSTRAINT "PK_dispute_cases" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_dispute_cases_case_reference" UNIQUE ("case_reference"),
  CONSTRAINT "FK_dispute_cases_client"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "FK_dispute_cases_property"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "FK_dispute_cases_valuation_notice"
    FOREIGN KEY ("valuation_notice_id") REFERENCES "valuation_notices"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "FK_dispute_cases_accountant"
    FOREIGN KEY ("assigned_accountant_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "FK_dispute_cases_lawyer"
    FOREIGN KEY ("assigned_lawyer_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- ------------------------------------------------------------

CREATE TABLE "dispute_legal_grounds" (
  "id"         uuid                                  NOT NULL DEFAULT uuid_generate_v4(),
  "dispute_id" uuid                                  NOT NULL,
  "ground"     "dispute_legal_grounds_ground_enum"   NOT NULL,
  "notes"      text,
  "validated"  boolean                               NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ                           NOT NULL DEFAULT now(),
  CONSTRAINT "PK_dispute_legal_grounds" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_dispute_legal_grounds_dispute_ground" UNIQUE ("dispute_id", "ground"),
  CONSTRAINT "FK_dispute_legal_grounds_dispute"
    FOREIGN KEY ("dispute_id") REFERENCES "dispute_cases"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

-- ------------------------------------------------------------

CREATE TABLE "comparable_sales" (
  "id"                          uuid        NOT NULL DEFAULT uuid_generate_v4(),
  "dispute_case_id"             uuid        NOT NULL,
  "address"                     text        NOT NULL,
  "sale_date"                   date        NOT NULL,
  "sale_price"                  NUMERIC(15,2) NOT NULL,
  "estimated_improvements_value" NUMERIC(15,2) NOT NULL,
  "adjusted_land_value"         NUMERIC(15,2) NOT NULL,
  "land_area_sqm"               NUMERIC(10,2),
  "notes"                       text,
  "created_by_id"               uuid        NOT NULL,
  "created_at"                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PK_comparable_sales" PRIMARY KEY ("id"),
  CONSTRAINT "FK_comparable_sales_dispute_case"
    FOREIGN KEY ("dispute_case_id") REFERENCES "dispute_cases"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "FK_comparable_sales_created_by"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- ------------------------------------------------------------

CREATE TABLE "dispute_documents" (
  "id"               uuid                                    NOT NULL DEFAULT uuid_generate_v4(),
  "dispute_id"       uuid                                    NOT NULL,
  "document_type"    "dispute_documents_document_type_enum"  NOT NULL,
  "filename"         text                                    NOT NULL,
  "blob_storage_url" text                                    NOT NULL,
  "uploaded_by"      uuid,
  "uploaded_at"      TIMESTAMPTZ                             NOT NULL DEFAULT now(),
  CONSTRAINT "PK_dispute_documents" PRIMARY KEY ("id"),
  CONSTRAINT "FK_dispute_documents_dispute"
    FOREIGN KEY ("dispute_id") REFERENCES "dispute_cases"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "FK_dispute_documents_uploaded_by"
    FOREIGN KEY ("uploaded_by") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- ------------------------------------------------------------

CREATE TABLE "dispute_constraints" (
  "id"              uuid                                        NOT NULL DEFAULT uuid_generate_v4(),
  "dispute_id"      uuid                                        NOT NULL,
  "constraint_type" "dispute_constraints_constraint_type_enum"  NOT NULL,
  "description"     text,
  "created_at"      TIMESTAMPTZ                                 NOT NULL DEFAULT now(),
  CONSTRAINT "PK_dispute_constraints" PRIMARY KEY ("id"),
  CONSTRAINT "FK_dispute_constraints_dispute"
    FOREIGN KEY ("dispute_id") REFERENCES "dispute_cases"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX "IDX_dispute_constraints_dispute" ON "dispute_constraints" ("dispute_id");

-- ------------------------------------------------------------

CREATE TABLE "constraint_files" (
  "id"                    uuid                                        NOT NULL DEFAULT uuid_generate_v4(),
  "dispute_constraint_id" uuid                                        NOT NULL,
  "document_category"     "constraint_files_document_category_enum"   NOT NULL,
  "blob_path"             text                                        NOT NULL,
  "original_name"         text                                        NOT NULL,
  "file_size_bytes"       integer                                     NOT NULL,
  "upload_status"         "upload_status_enum"                        NOT NULL DEFAULT 'pending',
  "uploaded_by"           uuid                                        NOT NULL,
  "uploaded_by_role"      "uploaded_by_role_enum"                     NOT NULL,
  "confirmed_by"          uuid,
  "confirmed_at"          TIMESTAMPTZ,
  "uploaded_at"           TIMESTAMPTZ                                 NOT NULL DEFAULT now(),
  CONSTRAINT "PK_constraint_files" PRIMARY KEY ("id"),
  CONSTRAINT "FK_constraint_files_dispute_constraint"
    FOREIGN KEY ("dispute_constraint_id") REFERENCES "dispute_constraints"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "FK_constraint_files_uploader"
    FOREIGN KEY ("uploaded_by") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "FK_constraint_files_confirmer"
    FOREIGN KEY ("confirmed_by") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "IDX_constraint_files_constraint" ON "constraint_files" ("dispute_constraint_id");
CREATE INDEX "IDX_constraint_files_status"     ON "constraint_files" ("upload_status");

-- ------------------------------------------------------------

CREATE TABLE "package_documents" (
  "id"              uuid                           NOT NULL DEFAULT uuid_generate_v4(),
  "dispute_case_id" uuid                           NOT NULL,
  "name"            text                           NOT NULL,
  "category"        "package_document_category_enum" NOT NULL,
  "status"          "package_document_status_enum" NOT NULL DEFAULT 'pending',
  "blob_name"       text,
  "file_size_bytes" integer,
  "generated_at"    TIMESTAMPTZ,
  CONSTRAINT "PK_package_documents" PRIMARY KEY ("id"),
  CONSTRAINT "FK_package_documents_dispute_case"
    FOREIGN KEY ("dispute_case_id") REFERENCES "dispute_cases"("id")
    ON DELETE CASCADE
);

CREATE INDEX "IDX_package_documents_dispute_case_id" ON "package_documents" ("dispute_case_id");