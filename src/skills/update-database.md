---
name: update-database
description: >
  Step-by-step guide for all database schema changes and AI-driven write-back
  operations in the LandTaxValuationDispute NestJS/TypeORM/PostgreSQL backend.
  Trigger when adding entities, columns, enums, relationships, migrations, seed
  data, or when an AI function needs to write structured data back to the database.
---

# Database Update Guide — LandTaxValuationDispute Backend

This skill governs all database schema changes and AI-driven write-back operations
for the LandTaxValuationDispute NestJS/TypeORM/PostgreSQL backend.

**Stack:** NestJS · TypeORM · PostgreSQL · `numeric` transformer · timestamptz

---

## Database Overview

| Entity | Table | Purpose |
|---|---|---|
| User | `users` | System users (accountants, admins, assessors) |
| Client | `clients` | Clients from XPM and intake forms |
| Property | `properties` | Real properties under dispute |
| DisputeCase | `dispute_cases` | Core dispute case records |
| ValuationNotice | `valuation_notices` | Valuation notices linked to properties |
| ValuationNoticeFile | `valuation_notice_files` | Documents for valuation notices |
| AssessmentDocument | `assessment_documents` | Assessment documents linked to clients |
| DisputeLegalGround | `dispute_legal_grounds` | Legal grounds selected per case |
| ComparableSale | `comparable_sales` | Comparable sales evidence |
| DisputeConstraint | `dispute_constraints` | Property constraints (heritage, flood, etc.) |
| ConstraintFile | `constraint_files` | Supporting documents for constraints |
| DisputeDocument | `dispute_documents` | General documents attached to cases |
| PackageDocument | `package_documents` | Generated objection package documents |
| LandTaxRate | `land_tax_rates` | Tax computation rates by year |
| Notification | `notifications` | In-app notifications for users |
| AuditLog | `audit_logs` | Audit trail for case actions |

---

## Part A — Schema Changes (Entity + Migration + Seeder)

Follow this order **every time**:

```
1. Update Entity  →  2. Write Migration  →  3. Update Seeder (if needed)  →  4. Verify
```

Never use `synchronize: true` — all schema changes go through migrations.

---

### Step 1 — Update the Entity

Entity files live at `src/api/<module>/entities/<name>.entity.ts`.

#### Adding a column

```typescript
@Column({ type: 'text', nullable: true })
my_new_column: string | null;
```

#### Adding a numeric column (use transformer — PostgreSQL returns NUMERIC as strings)

```typescript
@Column({ type: 'numeric', precision: 15, scale: 2, nullable: true, transformer: numericTransformer })
my_amount: number | null;
```

#### Adding an enum column

Define the enum in a shared constants file first, then:

```typescript
@Column({ type: 'enum', enum: MyEnum, nullable: true })
my_status: MyEnum | null;
```

#### Adding a relationship

```typescript
@ManyToOne(() => OtherEntity, { nullable: true, onDelete: 'SET NULL' })
@JoinColumn({ name: 'other_entity_id' })
other_entity: OtherEntity | null;

@Column({ type: 'uuid', nullable: true })
other_entity_id: string | null;
```

#### Column naming rules

- Column names: `snake_case`
- Nullable FK columns default `null` unless always required
- Temporal columns always use `timestamptz`
- Blob references stored as `text` paths — never binary

---

### Step 2 — Write the Migration

Migration files live at `src/database/migrations/`.

**Filename format:** `<unix-timestamp-ms>-<PascalCaseName>.ts`

Generate the timestamp: `Date.now()` in milliseconds.

#### Migration template

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class MyMigrationName1234567890000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // your changes here
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // reverse changes here
  }
}
```

#### Adding a column

```typescript
// up
await queryRunner.query(`ALTER TABLE "my_table" ADD COLUMN "my_column" TEXT`);

// down
await queryRunner.query(`ALTER TABLE "my_table" DROP COLUMN "my_column"`);
```

#### Adding a nullable column with default

```typescript
// up
await queryRunner.query(`
  ALTER TABLE "my_table"
  ADD COLUMN "my_column" SMALLINT NOT NULL DEFAULT 0
`);

// down
await queryRunner.query(`ALTER TABLE "my_table" DROP COLUMN "my_column"`);
```

#### Adding a new enum value (PostgreSQL enum — safe pattern)

```typescript
// up
await queryRunner.query(`
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'new_value'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'dispute_cases_status_enum')
    ) THEN
      ALTER TYPE "dispute_cases_status_enum" ADD VALUE 'new_value';
    END IF;
  END $$;
`);

// down — PostgreSQL cannot remove enum values; document this limitation
// To reverse: recreate the enum type without the value (destructive, requires data migration)
```

#### Creating a new table

```typescript
// up
await queryRunner.query(`
  CREATE TABLE "my_new_table" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "dispute_case_id" uuid NOT NULL,
    "value" NUMERIC(15,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "PK_my_new_table" PRIMARY KEY ("id"),
    CONSTRAINT "FK_my_new_table_dispute_case"
      FOREIGN KEY ("dispute_case_id")
      REFERENCES "dispute_cases"("id") ON DELETE CASCADE
  )
`);

// down
await queryRunner.query(`DROP TABLE "my_new_table"`);
```

#### Adding an index

```typescript
// up
await queryRunner.query(`
  CREATE INDEX "IDX_my_table_status" ON "my_table" ("status")
`);

// down
await queryRunner.query(`DROP INDEX "IDX_my_table_status"`);
```

#### Migration safety rules

- Always write `down()` — never leave it empty
- Wrap related changes in one migration, not multiple small ones
- Use `IF NOT EXISTS` / `IF EXISTS` guards for idempotency
- Never drop a column without confirming it has no active references
- Enum removals are destructive — coordinate with the team before running

---

### Step 3 — Update Seeders (if needed)

Seeder files live at `src/database/seeds/`.

| Seeder | Environment | Purpose |
|---|---|---|
| `user.seeder.ts` | All | Default users |
| `land-tax-rates.seeder.ts` | All | Tax rate data by year |
| `client.seeder.ts` | Dev/QA | Test clients |
| `objection-package.seeder.ts` | Dev/QA | Objection package workflow |
| `case-closed-no-objection.seeder.ts` | Dev/QA | Closed without objection |
| `notification.seeder.ts` | Dev/QA | Test notifications |
| `vg-monitor-test.seeder.ts` | Dev/QA | VG email monitoring |
| `submit-to-vg.seeder.ts` | Dev/QA | Submitted to VG cases |
| `cases-pagination.seeder.ts` | Dev/QA | Pagination test data |
| `comparables-test.seeder.ts` | Dev/QA | Comparable sales |
| `tax-savings-test.seeder.ts` | Dev/QA | Tax savings calculations |

Update the relevant seeder to reflect any new required fields or default values.
Production seeders (`user.seeder.ts`, `land-tax-rates.seeder.ts`) must be safe to
run in production — never hardcode test data there.

---

### Step 4 — Verify

```bash
# Run migrations
npm run migration:run

# Confirm the migration was applied
npm run migration:show

# Run the app to confirm entities resolve
npm run start:dev
```

---

## Part B — AI-Driven Write-Back Rules

When an AI function updates the database, apply these rules before executing any write.

---

### Step 1 — Identify the Target Record

Use the match priority hierarchy:

| Priority | Field | Reliability |
|---|---|---|
| 1 | UUID (`id`) | Definitive |
| 2 | `case_reference` | Unique per case |
| 3 | `pid` on properties | Near-unique |
| 4 | Canonical address | Strong operational identifier |
| 5 | Assessment amount + address | Financial confirmation |

Never update without a confirmed UUID match. If only partial identifiers are available,
route to `FOR_REVIEW` status for human confirmation.

---

### Step 2 — Validate Before Writing

Before any `UPDATE`:

1. **Record exists** — confirm the row exists; never assume
2. **Status allows the update** — check the case status against the allowed transition table below
3. **No conflicting identifiers** — if PID and address resolve to different records, abort and flag
4. **Non-null values only** — never overwrite an existing value with `null`
5. **Numeric precision** — amounts stored as `NUMERIC(15,2)`; round to 2 decimal places before insert

---

### Step 3 — Allowed Status Transitions (dispute_cases)

The full status flow:

```
pending_tnc
  → draft
    → grounds_selection
      → evidence_compilation
        → appraisal
          → advisory_letter_issued
          → objection_package_prepared
            → awaiting_client_approval
              → client_approved
                → submitted_to_vg
                  → vg_response_received  [automated by email monitor]
                    → vg_approved         [automated by AI classifier]
                    → vg_declined         [automated by AI classifier]
                    → for_review          [automated — low confidence]
                      → outcome_received
                        → closed
  → closed_no_objection  [from any status — manual decision]
```

**AI classifiers may only set:** `vg_approved`, `vg_declined`, `for_review`

**AI classifiers must not set:** `closed`, `submitted_to_vg`, `pending_tnc`, or any
status that requires human action or financial commitment.

---

### Step 4 — Safe Write-Back by Table

#### `dispute_cases`

| Column | AI can write | Conditions |
|---|---|---|
| `status` | `vg_approved`, `vg_declined`, `for_review` only | Current status must be `vg_response_received` |
| `outcome` | `upheld`, `partially_upheld`, `rejected`, `withdrawn` | Only after status = `vg_approved` or `vg_declined` |
| `final_agreed_value` | Yes | Only when `outcome` is set; round to 2dp |
| `tax_saving_achieved` | Yes | Derived from original vs. final value |
| `vg_response_notes` | Append only — never overwrite | Prefix each entry with ISO timestamp |
| `closed_at` | Never | Human action only |
| `client_approval_token` | Never | System-generated only |

#### `valuation_notices`

| Column | AI can write | Conditions |
|---|---|---|
| `appraised_value` | Yes | Only when status = `appraisal`; round to 2dp |
| `valuation_delta` | Yes | Computed: `appraised_value - assessed_land_value` |
| `decision_outcome` | `OBJECTION` or `ADVISORY` | Required when saving appraisal |
| `analyst_notes` | Append only | Prefix with ISO timestamp |
| `appraised_by_id` | Yes | Must be a valid user UUID |
| `appraised_at` | Yes | Set to current UTC timestamp |

#### `notifications`

| Column | AI can write | Notes |
|---|---|---|
| `type` | From enum only | `vg_response_received`, `vg_follow_up_sent` |
| `message` | Yes | Keep under 500 characters |
| `caseId` | Yes | Must be a valid dispute case UUID |
| `userId` | Yes | Must be a valid user UUID |
| `read` | Never | User action only |

#### `audit_logs`

| Column | AI can write | Notes |
|---|---|---|
| `action` | `SUBMITTED_TO_VG`, `VG_FOLLOW_UP_SENT` | From AuditAction enum only |
| `performedBy` | Yes | UUID of the triggering user or system user |
| `caseId` | Yes | Must match the case being acted upon |
| `lodgmentReferenceNumber` | Yes | If available from VG response |

#### Tables AI must NOT write to

- `users` — account management only
- `clients` — XPM sync or manual intake only
- `properties` — manual intake only
- `land_tax_rates` — annual admin update only
- `package_documents` — generated by document service only
- `client_approval_token` — system-generated only

---

### Step 5 — Write-Back Output Schema

Every AI write-back must return this structure:

```json
{
  "success": true,
  "table": "dispute_cases",
  "record_id": "uuid",
  "fields_updated": ["status", "outcome"],
  "previous_values": { "status": "vg_response_received" },
  "new_values": { "status": "vg_approved", "outcome": "upheld" },
  "audit_logged": true,
  "timestamp": "2026-05-18T10:00:00.000Z"
}
```

On failure:

```json
{
  "success": false,
  "table": "dispute_cases",
  "record_id": "uuid",
  "reason": "Status transition not allowed: current status is 'closed'",
  "action_required": "manual_review",
  "timestamp": "2026-05-18T10:00:00.000Z"
}
```

---

### Step 6 — Idempotency

Before writing, generate a deduplication hash:

```text
SHA256(table + record_id + field_name + new_value + source_event_id)
```

Store processed hashes in a `processed_events` log (or use the `audit_logs` table
with a `meta` field). Reject duplicate writes silently and return `success: true`
with a `duplicate: true` flag.

---

### Step 7 — Audit Log Requirement

Every AI-initiated status change or financial value write on `dispute_cases` or
`valuation_notices` **must** create a corresponding row in `audit_logs`.

If the audit log insert fails, roll back the main write. Both writes should occur
inside a TypeORM `QueryRunner` transaction:

```typescript
const queryRunner = dataSource.createQueryRunner();
await queryRunner.connect();
await queryRunner.startTransaction();
try {
  await queryRunner.manager.update(DisputeCase, id, payload);
  await queryRunner.manager.insert(AuditLog, auditPayload);
  await queryRunner.commitTransaction();
} catch (err) {
  await queryRunner.rollbackTransaction();
  throw err;
} finally {
  await queryRunner.release();
}
```

---

## Part C — Enum Reference

### DisputeCase Status

```
pending_tnc | draft | grounds_selection | evidence_compilation | appraisal |
advisory_letter_issued | objection_package_prepared | awaiting_client_approval |
client_approved | submitted_to_vg | vg_response_received | vg_approved |
vg_declined | for_review | outcome_received | closed | closed_no_objection
```

### DisputeCase Outcome

```
upheld | partially_upheld | rejected | withdrawn
```

### Legal Ground

```
incorrect_land_value | constraint_oversight | incorrect_area_or_dimensions |
incorrect_apportionment | not_sure
```

### Constraint Type

```
heritage_listing | flood_zone_100yr | bushfire_bal_restriction |
easement_or_right_of_way | environmental_conservation_overlay |
zoning_planning_restriction | access_restriction_landlocked |
contamination_remediation | comparable_sales | market_value | land_use | other
```

### Notification Type

```
approval_requested | approval_reminder | approval_reminder_max_reached |
vg_follow_up_sent | vg_response_received
```

### Audit Action

```
SUBMITTED_TO_VG | VG_FOLLOW_UP_SENT
```

### Upload Status

```
pending | scanning | complete | failed | rejected
```

### User Role

```
accountant | admin | Internal Assessor
```

---

## Key Reminders

- **Never use `synchronize: true`** — all schema changes go through migrations
- **Numeric transformer is required** on all `NUMERIC` columns — PostgreSQL returns them as strings
- **Always write `down()`** in every migration
- **Enum values cannot be removed** from PostgreSQL without recreating the type — plan additions carefully
- **AI status writes are restricted** to `vg_approved`, `vg_declined`, `for_review` only
- **Append-only fields** (`vg_response_notes`, `analyst_notes`) must never be overwritten
- **All AI writes require a transaction** that includes the audit log insert
- **`for_review` is the safe fallback** — when confidence is low or identifiers conflict, always route there
