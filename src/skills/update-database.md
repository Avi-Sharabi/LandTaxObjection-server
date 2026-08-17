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

Never update without a confirmed UUID match. If only partial identifiers are available, write
nothing and flag for human confirmation.

---

### Step 2 — Validate Before Writing

Before any `UPDATE`:

1. **Record exists** — confirm the row exists; never assume
2. **Status allows the update** — check the case status against the allowed transition table below
3. **No conflicting identifiers** — if PID and address resolve to different records, abort and flag
4. **Non-null values only** — never overwrite an existing value with `null`
5. **Numeric precision** — amounts stored as `NUMERIC(15,2)`; round to 2 decimal places before insert

---

### Step 3 — `dispute_cases.status` is NOT AI-writable

> **You must never write `dispute_cases.status`.** The database rejects it: the column is on the
> protected list in `UpdateDatabaseService`, and an attempt returns
> `action_required: "use_transition_endpoint"`.
>
> Status changes carry side effects — a lodgement reference, an email to the Valuer General, an
> advisory letter to the client, follow-up counter resets, an audit row — and a bare `UPDATE`
> performs none of them, leaving the case in a state the rest of the system believes is impossible.
> A person changes status through `PATCH /api/v1/dispute-cases/:id/status`.
>
> What you CAN do with a VG response is record the facts: append to `vg_response_notes` and set
> `outcome`. A human then moves the case.

The lifecycle exists here only so you can *read* a case's position. There are 9 statuses, and the
flow is **cyclic** — a YML further submission re-enters the VG loop, so a case can pass through
`vg_response_received` more than once. The authoritative definition is
`DISPUTE_STATUS_TRANSITIONS` in `src/api/dispute-cases/dispute-status.ts`.

```
created                                 [intake]
  → tnc_agreed                          [terms of engagement agreed — manual]
    → reports_uploaded                  [land value search + sales report on file — automatic
                                         on POST /api/v1/assessment-documents/batch]
      → analysed                        [automatic when the analyze-ai job completes]
        → objection_submitted           [lodged with the VG — manual]
          → vg_response_received        [a reply arrived; no outcome asserted yet — manual]
            → ai_further_submission     [further submission lodged — manual]
              → vg_response_received    [loop back; the cycle may repeat]
            → vg_agreed                 [VG accepted the objection — manual]
              → case_closed
  → case_closed                         [from any open status — manual]
```

Notes that matter when reading a status:

- **There is no "declined" or "partially agreed" status.** An unfavourable or partial reply is
  `vg_response_received`; the substance lives in `outcome` (`rejected` / `partially_upheld`) and in
  `vg_response_notes`.
- **`vg_response_received` is the human review queue.** A case sits there until a person decides
  whether to make a further submission, record agreement, or close.
- **There is no client-approval step.** The objection package is never sent to the client for
  approval; the accountant lodges on their own authority. Do not look for an approval column.
- **Advisory vs objection is not a status.** It is `valuation_notices.decision_outcome`
  (`ADVISORY` | `OBJECTION`).
- **A no-objection close is not a status.** It is `case_closed` with `advisory_view_token` set.
- **Lodgement is not a status.** It is `submitted_at` being non-null.

---

### Step 4 — Write-Back Scope

Apply the instruction exactly as given — update whichever table and columns the request specifies or
implies. Everything is writable except the one column named in Step 3. An attempt to write it returns
`action_required: "use_transition_endpoint"` — do not retry it, and do not try to reach the same end
state through another column.

---

### Step 5 — Write-Back Output Schema

Every AI write-back must return this structure:

```json
{
  "success": true,
  "table": "dispute_cases",
  "record_id": "uuid",
  "fields_updated": ["outcome", "vg_response_notes"],
  "previous_values": { "outcome": null },
  "new_values": { "outcome": "upheld", "vg_response_notes": "…" },
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
  "reason": "dispute_cases.status is not AI-writable",
  "action_required": "use_transition_endpoint",
  "timestamp": "2026-05-18T10:00:00.000Z"
}
```

---

## Key Reminders

- **Schema changes are developer-only** — AI must never create migrations, add columns, create tables, or modify seeders
- **`dispute_cases.status` is never AI-writable** — it is rejected in code. Record the facts
  (`outcome`, `vg_response_notes`) and leave the status to a person
- **Append-only fields** (`vg_response_notes`, `analyst_notes`) must never be overwritten
- **When confidence is low or identifiers conflict, write nothing and flag for review** — do not
  assert an outcome you cannot support
