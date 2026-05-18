# Property Database Match Strategy  
## NSW VG Objection Classifier → Database Record Lookup (Enhanced Production Version v2)

---

# Overview

This strategy describes how to take structured NSW VG classifier output and reliably locate the corresponding property record in your database, accounting for:

- address format variations
- OCR inconsistencies
- abbreviations
- missing fields
- strata/unit formatting
- multiple trust holdings
- fuzzy matching scenarios

The matching process prioritises:

1. **PID (Property Identifier)** — strongest identifier
2. **Property Address** — primary operational identifier
3. **Assessment Amount** — financial confirmation signal

These three fields together form a highly reliable composite property identity.

---

# Recommended Classifier Output Shape

```json
{
  "status": "DECLINED",
  "confidence": "HIGH",
  "property_address": "Unit 4, 25 Terminus Street, Castle Hill NSW",
  "pid": "617612",
  "assessment_amount": 26008.50,
  "original_land_value": null,
  "amended_land_value": null,
  "valuation_year": 2025,
  "decision_date": null,
  "objection_reference": null,
  "partially_allowed": false,
  "further_action_required": false,
  "notes": "..."
}
```

---

# Match Priority Hierarchy

| Priority | Field | Reliability |
|---|---|---|
| 1 | PID | Definitive / near-unique |
| 2 | Canonical Address | Strong operational identifier |
| 3 | Assessment Amount | Financial confirmation |
| 4 | Valuation Year | Context confirmation |
| 5 | Objection Reference | Definitive if present |
| 6 | Land Values | Secondary validation |

---

# Step 1 — Normalise the Property Address

Before querying your database, normalise `property_address` into structured components.

---

## Parse Into Components

| Component | Example |
|---|---|
| Unit / lot prefix | `Unit 4` |
| Street number | `25` |
| Street name | `Terminus` |
| Street type | `Street` |
| Suburb | `Castle Hill` |
| State | `NSW` |
| Postcode | `2154` |

---

# Address Normalisation Rules

## Formatting Cleanup

- Strip punctuation
- Collapse duplicate spaces
- Unicode normalize OCR text
- Remove line breaks
- Uppercase suburb/state

Example:

```text
"Unit 4," → "Unit 4"
```

---

## Street Type Expansion

| Variant | Canonical |
|---|---|
| ST | STREET |
| RD | ROAD |
| AVE | AVENUE |
| CT | COURT |
| CRES | CRESCENT |
| PDE | PARADE |
| TCE | TERRACE |
| HWY | HIGHWAY |

---

## Unit Prefix Equivalence

| Variant | Canonical |
|---|---|
| UNIT | U |
| APT | U |
| APARTMENT | U |
| UNIT NO | U |

Treat `LOT` separately from unit numbers.

---

## Postcode Resolution

If postcode missing:

```text
Castle Hill NSW → 2154
```

Use postcode as a **soft confirmation signal**, not a hard requirement.

---

# Step 2 — Generate Canonical Address Key

Convert all address variants into a single canonical representation.

---

## Example Variants

| Raw Address | Canonical |
|---|---|
| Unit 4, 25 Terminus Street | U4\|25\|TERMINUS\|STREET\|CASTLEHILL\|NSW\|2154 |
| 4/25 Terminus St | U4\|25\|TERMINUS\|STREET\|CASTLEHILL\|NSW\|2154 |
| 25 Terminus Street Unit 4 | U4\|25\|TERMINUS\|STREET\|CASTLEHILL\|NSW\|2154 |

---

# Step 3 — Primary Match Logic

---

## 3a. PID Exact Match (Highest Priority)

If PID exists:

```sql
SELECT *
FROM properties
WHERE pid = '617612'
```

### Result Handling

| Result | Action |
|---|---|
| One record | VERY_HIGH confidence → auto-approve |
| Multiple records | Resolve using address + assessment amount |
| No records | Continue to address matching |

---

## 3b. Exact Canonical Address Match

```sql
SELECT *
FROM properties
WHERE canonical_address =
'U4|25|TERMINUS|STREET|CASTLEHILL|NSW|2154'
```

---

## 3c. Address + Assessment Amount Match

If multiple address matches exist:

```sql
SELECT *
FROM properties
WHERE canonical_address =
'U4|25|TERMINUS|STREET|CASTLEHILL|NSW|2154'
AND assessment_amount = 26008.50
```

Assessment amount acts as a strong financial confirmation signal.

---

# Step 4 — Fallback Matching

If exact matching fails, progressively relax constraints.

---

## 4a. Drop Unit Number

```sql
SELECT *
FROM properties
WHERE street_number = '25'
AND street_name = 'Terminus'
AND suburb = 'Castle Hill'
```

Inspect candidate unit/lot relationships.

---

## 4b. Token-Based Street Match

```sql
SELECT *
FROM properties
WHERE street_name ILIKE '%Terminus%'
AND suburb = 'Castle Hill'
```

Useful for:

- OCR corruption
- abbreviations
- typos

---

## 4c. Similarity Scoring

If supported (e.g. `pg_trgm`, Levenshtein, Elasticsearch, Typesense):

```text
Classifier:
Unit 4 25 Terminus Street Castle Hill NSW 2154

Database:
4/25 Terminus St Castle Hill 2154
```

Any similarity match that passes the stack's default threshold routes to `FOR_REVIEW` for human confirmation. No auto-approve on fuzzy matches.

| Match Outcome | Action |
|---|---|
| Similarity meets threshold | `FOR_REVIEW` → human confirms before write-back |
| Similarity below threshold | `FOR_REVIEW` queue |

---

# Step 5 — Match Confidence Model

Confidence is determined by **identifier presence**, not scoring weights.

| Match Method | Confidence | Action |
|---|---|---|
| PID + Address + Assessment Amount | VERY_HIGH | Auto-approve |
| PID + Address | HIGH | Auto-approve |
| Address only (exact canonical) | MEDIUM | Auto-approve |
| Fuzzy address match | FOR_REVIEW | Human confirms |
| No match | FOR_REVIEW | Queue for assessor |

---

# Step 6 — Secondary Confirmation Fields

Once a candidate is identified, confirm using:

| Field | Action |
|---|---|
| objection_reference | Definitive identifier if present |
| valuation_year | Confirm assessment year |
| original_land_value | Verify consistency |
| assessment_amount | Verify financial alignment |
| status | Confirm workflow state |

---

# Step 7 — Strata / Parent Lot Handling

Many NSW datasets store:

- parent parcel only
- strata plan only
- no unit number

Fallback lookup:

```sql
SELECT *
FROM properties
WHERE street_number = '25'
AND street_name = 'Terminus'
AND suburb = 'Castle Hill'
```

Then inspect:

- strata plan metadata
- child unit relationships
- parcel ownership structure

---

# Step 8 — Handle No-Match Outcomes

| Scenario | Action |
|---|---|
| Clear address but no record | Create `UNMATCHED_NEW` |
| Ambiguous candidates | `AMBIGUOUS_MATCH` |
| OCR damaged / partial | Queue as `FOR_REVIEW` |
| Multiple trust holdings | Use assessment amount + PID |

---

# Step 9 — Safe Write-Back Rules

Apply only non-null updates.

```text
status → DECLINED
confidence → HIGH
notes → append only
```

Never overwrite existing values with null.

---

# Step 10 — Match Operation Logging

Log every match attempt.

| Field | Example |
|---|---|
| classifier_address | Raw classifier address |
| canonical_address | U4\|25\|TERMINUS... |
| pid | 617612 |
| assessment_amount | 26008.50 |
| match_method | PID_EXACT |
| match_confidence | HIGH |
| matched_record_id | Internal DB ID |
| secondary_fields_confirmed | PID, assessment_amount |
| reviewed_by | reviewer ID |
| timestamp | ISO 8601 |

---

# Step 11 — Idempotency Protection

Prevent duplicate processing.

Generate:

```text
SHA256(
  property_address +
  pid +
  assessment_amount +
  valuation_year +
  status
)
```

Store processed hashes.

---

# Step 12 — Final Match Result Structure

```json
{
  "matched": true,
  "property_address": "1020 Melia Court, Castle Hill NSW 2154",
  "normalized_address": {
    "street_number": "1020",
    "street_name": "Melia",
    "street_type": "Court",
    "suburb": "Castle Hill",
    "state": "NSW",
    "postcode": "2154"
  },
  "canonical_key": "1020|MELIA|COURT|CASTLEHILL|NSW|2154",
  "property_details": {
    "pid": "3701422",
    "assessment_amount": 703574.80,
    "tax_year": 2025
  },
  "match_method": "PID_AND_ADDRESS_MATCH",
  "match_confidence": "HIGH",
  "secondary_fields_confirmed": [
    "PID",
    "assessment_amount",
    "tax_year",
    "land_value"
  ],
  "manual_review_required": false
}
```

---

# Recommended Production Match Order

```text
1. PID exact match
2. Canonical address exact match
3. Address + assessment amount
4. Address similarity scoring (FOR_REVIEW)
5. Strata/parent lot resolution
6. FOR_REVIEW fallback
```

---

# Key Production Insight

The combination of:

- PID
- Canonical address
- Assessment amount

creates an extremely reliable property identity layer for NSW VG and land tax workflows.

This dramatically reduces:

- false positives
- duplicate matches
- trust-level ambiguity
- OCR-related failures
- FOR_REVIEW workload