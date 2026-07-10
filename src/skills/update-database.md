---
name: update-database
description: >
  Governs AI-driven write-back operations in the LandTaxValuationDispute
  NestJS/TypeORM/PostgreSQL backend. Trigger when an AI function needs to
  update existing records. AI is NOT permitted to create migrations, seeders,
  add columns, or create tables — those are developer-only tasks.
---

# Database Update Guide — LandTaxValuationDispute Backend

This skill governs **AI-driven data write-back only**. All schema changes
(migrations, seeders, new columns, new tables) are **developer tasks** — AI
must not generate or suggest code for them.

**Stack:** NestJS · TypeORM · PostgreSQL

---

## AI Scope — What Is and Is Not Allowed

| Operation | Allowed |
|---|---|
| UPDATE existing rows | **Yes** — subject to rules below |
| INSERT audit log / notification rows | **Yes** — as part of a write-back transaction |
| Create a migration file | **No — developer only** |
| Add a column to an entity or table | **No — developer only** |
| Create a new table | **No — developer only** |
| Write or modify a seeder | **No — developer only** |
| DROP or truncate any table | **No — never** |

If a task requires schema changes, stop and instruct the developer to follow
the project's manual migration process. Do not proceed.

---

## AI-Driven Write-Back Rules

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

### Step 4 — Write-Back Scope

**All tables and columns in the database are writable.** There are no blocked tables or restricted columns. Apply the instruction exactly as given — update whichever table and columns are specified or implied by the user's request.

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

## Key Reminders

- **Schema changes are developer-only** — AI must never create migrations, add columns, create tables, or modify seeders
- **AI status writes are restricted** to `vg_approved`, `vg_declined`, `for_review` only
- **Append-only fields** (`vg_response_notes`, `analyst_notes`) must never be overwritten
- **All AI writes require a transaction** that includes the audit log insert
- **`for_review` is the safe fallback** — when confidence is low or identifiers conflict, always route there
