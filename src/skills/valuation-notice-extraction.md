---
name: nsw-land-tax-assessment-extractor
description: >
  Use this skill to extract structured property data from a NSW Land Tax
  Assessment Notice (issued by Revenue NSW / the Chief Commissioner of State
  Revenue). Always trigger when the user uploads or pastes a NSW Land Tax
  Assessment Notice PDF, or asks to "extract", "pull", "read", or "parse" the
  land / property details from a land tax assessment. The skill reads the
  "Aggregated land" table(s) and returns an array of tax-year objects, one per
  table, each listing every property with its address, PID, state, ownership
  percentage, and assessed land value for that tax year.
---

# NSW Land Tax Assessment Notice — Data Extractor

This skill extracts the per-property data from the **Aggregated land** table(s)
in a NSW Land Tax Assessment Notice and returns it as clean JSON.

A single notice usually contains **one Aggregated land table per tax year**
(e.g. a notice covering "2024, 2025 Tax Years" has two tables). Extract **every**
table and return one object per tax year. Do not merge tax years — the values
differ between years.

---

## When to Use This Skill

- User uploads a NSW Land Tax Assessment Notice (PDF) and wants the data out of it
- User wants the property list, PIDs, or land values from an assessment
- The document is being ingested into the objection / report-generation pipeline

---

## Step 1 — Locate the Aggregated Land Table(s)

Each table appears under a heading **"Aggregated land"** on the "Supporting
information (cont.)" pages. Immediately **above** each table is a line like:

> The assessment for the **2025** tax year is based on the following land owned
> as at 31 December 2024

That line gives you the `taxYear` for that table (here, `2025`).

The table has these columns (left to right):

| Land item no. | Land item and property ID | Notes | % Owned | Land Tax Taxable Value | Surcharge Taxable Value | LAND VALUE(S) — one column per year | **Average land value** |
|---|---|---|---|---|---|---|---|

⚠️ **Critical:** the value you want is the **LAND VALUE(S) column whose year
header matches this table's own `taxYear`** (the year you identified from the
"assessment for the 20XX tax year…" line above the table). LAND VALUE(S) columns
are listed in ascending chronological order ending at the assessed year, so this
is always the **rightmost** LAND VALUE(S) column.

**Not** the "Average land value" column and **not** the "Land Tax Taxable Value"
column — both of those are tax-computation figures (a 3-year average used to
calculate the land tax bill), not the Valuer General's determined land value for
the assessed year. They often look similar to the correct value, and can even be
identical, but can also diverge from it significantly.

**Stop at the totals row.** Do **not** include the `Total aggregated land value`
row — it is a sum, not a property.

---

## Step 2 — Extract Each Property Row

For every property row in each table, extract:

| Output field | Source | Rule |
|---|---|---|
| `address` | "Land item and property ID" — the address line | Trim whitespace. Keep the source text (suburb is embedded, e.g. `1486 ANZAC PDE LITTLE BAY`). |
| `PID` | "Land item and property ID" — the `PID - NNNNNNN` line | Return **digits only**. Strip the `PID -` prefix and any spaces. |
| `State` | Document type | Always `"NSW"` — this is a NSW Land Tax Assessment Notice. |
| `ownership` | "% Owned" column | Format as a percentage string, e.g. `"100%"`. |
| `assessedLandValue` | **LAND VALUE(S) column matching this table's `taxYear`** (rightmost LAND VALUE(S) column) | Normalise digit spacing; return as a comma-formatted string, e.g. `"1,075,000"`. |

### Top-level fields (per tax-year object)

| Output field | Source | Rule |
|---|---|---|
| `issueDate` | "Issue date" (top of notice / Supporting information header) | Normalise to ISO `YYYY-MM-DD`, e.g. `3 November 2025` → `"2025-11-03"`. |
| `taxYear` | The "assessment for the 20XX tax year…" line above the table | The year as a string, e.g. `"2025"`. |

---

## Step 3 — Handle OCR / Messy Text

These notices are frequently scanned, so the extracted text layer is noisy. Be
resilient to:

- **PID prefix variants:** `PID -`, `PtD -`, `P1D -`, `P I D` → all mean **PID**.
  Extract the 7-digit number regardless.
- **Numbers with spaces:** land values print as `1 075 000` (space-separated) or
  `1075 000`. Collapse the spaces, then re-format with commas → `1,075,000`.
- **Lowercase L read as 1:** `l 075 000` → `1,075,000`.
- **Address casing / spacing:** keep the address as printed but collapse
  double spaces and trim.
- **Ditto rows:** if the same address repeats across rows with different PIDs,
  each PID is a **separate property** — output one entry per row.

Match columns by their **header meaning**, not by fixed character position, since
OCR shifts alignment.

---

## Step 4 — Return JSON Output

Return a **valid JSON array only** — no prose, no markdown fences. One object per
Aggregated land table (i.e. per tax year).

### Schema

```json
[
  {
    "issueDate": "YYYY-MM-DD",
    "taxYear": "string",
    "properties": [
      {
        "address": "string",
        "PID": "string (digits only)",
        "State": "NSW",
        "ownership": "string (e.g. \"100%\")",
        "assessedLandValue": "string (comma-formatted, from the LAND VALUE(S) column matching this tax year)"
      }
    ]
  }
]
```

If a field genuinely cannot be found, set it to `null`. Never guess a land value
or a PID.

---

## Worked Example (this exact notice)

Input: `1486 Anzac Parade` Land Tax Assessment Notice, issued 3 November 2025,
covering the 2024 and 2025 tax years — two Aggregated land tables.

Output:

```json
[
  {
    "issueDate": "2025-11-03",
    "taxYear": "2025",
    "properties": [
      {
        "address": "1486 ANZAC PDE LITTLE BAY",
        "PID": "4522322",
        "State": "NSW",
        "ownership": "100%",
        "assessedLandValue": "1,075,000"
      },
      {
        "address": "1486 ANZAC PDE LITTLE BAY",
        "PID": "4522323",
        "State": "NSW",
        "ownership": "100%",
        "assessedLandValue": "1,075,000"
      }
    ]
  },
  {
    "issueDate": "2025-11-03",
    "taxYear": "2024",
    "properties": [
      {
        "address": "1486 ANZAC PDE LITTLE BAY",
        "PID": "4522322",
        "State": "NSW",
        "ownership": "100%",
        "assessedLandValue": "1,000,000"
      },
      {
        "address": "1486 ANZAC PDE LITTLE BAY",
        "PID": "4522323",
        "State": "NSW",
        "ownership": "100%",
        "assessedLandValue": "1,000,000"
      }
    ]
  }
]
```

Note how the 2025 table gives a land value of `1,075,000` while the 2024
table gives `1,000,000` for the same properties — this is why each tax year is a
separate object.

---

## Worked Example (contrasting Average/Taxable Value vs. the correct column)

Input: a Land Tax Assessment Notice for **CASTLE HILL GLEN PTY LTD ATF CASTLE
HILL GLEN UNIT TRUST**, issued 24 February 2026, one Aggregated land table for
the **2026 tax year**, one land item (PID `3701422`, 100% owned):

| Notes | LAND VALUE(S) 2024 | LAND VALUE(S) 2025 | LAND VALUE(S) 2026 | Average land value | Land Tax Taxable Value |
|---|---|---|---|---|---|
| | 18,300,000 | 20,800,000 | 20,800,000 | 19,966,667 | 19,966,667 |

The table's `taxYear` is `2026`, so the correct column is **LAND VALUE(S)
2026 = `20,800,000`** — the rightmost LAND VALUE(S) column. Output:

```json
[
  {
    "issueDate": "2026-02-24",
    "taxYear": "2026",
    "properties": [
      {
        "address": "1020 MELIA CT CASTLE HILL",
        "PID": "3701422",
        "State": "NSW",
        "ownership": "100%",
        "assessedLandValue": "20,800,000"
      }
    ]
  }
]
```

⚠️ Note that both "Average land value" and "Land Tax Taxable Value" read
`19,966,667` here — a different number from the correct `20,800,000`. Do not be
fooled by them agreeing with each other; neither is the source column.

---

## Key Reminders

- **LAND VALUE(S) column matching the table's tax year only** — never the
  Average land value or Land Tax Taxable Value columns, even when they look
  right.
- **One object per tax year** — do not merge; values differ by year.
- **PID = digits only** — strip the prefix, ignore OCR mangling (`PtD`, `P1D`).
- **State is always `NSW`** for this document type.
- **Exclude the `Total aggregated land value` row.**
- **Every row is its own property**, even when the address repeats.
- Return **only the JSON array** — no surrounding text or markdown fences.

### Optional variants (ask the user which they want)

- **Latest year only:** return a single object for the highest tax year instead
  of the full array.
- **Numeric values:** return `assessedLandValue` as a raw integer (`1075000`) and
  `ownership` as a number (`100`) instead of formatted strings.