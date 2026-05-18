---
name: nsw-vg-email-classifier
description: >
  Classifies NSW Valuer General (VG) land tax objection response emails as
  approved, declined, or needs_review. Returns a structured JSON object for
  the automated case management pipeline. Trigger when processing any VG,
  Revenue NSW, or related body email about a land tax objection outcome.
---

# NSW VG Land Tax Objection — Email Classifier (Automated Pipeline)

This skill analyses an email containing a response to a NSW Valuer General (VG)
land tax objection and produces a structured JSON classification for the
automated case management pipeline.

The pipeline depends on exactly these output fields:
`outcome`, `confidence` (float 0.0–1.0), `pid`, `address`, `case_id`, `reasoning`, `conflict_detected`

---

## Step 1 — Extract Email Content

Read the **full** email subject and body before classifying. Do not classify
from the subject line alone.

### Step 1A — HTML Body Handling

Strip HTML tags mentally — focus on plain-text content. Ignore formatting,
navigation elements, and boilerplate footers. If the body is entirely HTML,
extract the visible text before proceeding.

### Step 1B — PDF Attachment Handling

If the content appears to be from a PDF or attachment:

1. Read all text available — outcome language often appears on the last page
2. If a determination notice is attached alongside a cover letter, the
   determination notice contains the binding outcome — prioritise it
3. If the content appears to be from a scanned image (fragmented/degraded
   text), set `outcome` to `needs_review` and note it in `reasoning`
4. If text is completely unreadable, return:
   ```json
   {
     "pid": null, "address": null, "outcome": "needs_review",
     "confidence": 0.1, "reasoning": "Content could not be extracted — manual review required.",
     "case_id": null, "conflict_detected": false
   }
   ```

### Step 1C — Non-English Email Handling

If the email is written in a language other than English:

1. Translate the full email to English before classifying
2. Reduce your final confidence by 0.15 to account for translation uncertainty
3. Note the original language in `reasoning`
4. If translation confidence is very low, set `outcome` to `needs_review`

---

## Step 2 — Extract Property Identifiers

Before classifying, identify all property identifiers in the email.

### PID (Property Identifier)

- Pattern: `PID: 123456`, `PID-789012`, `Property ID 456789`, or a bare 5–8
  digit number near the word "property", "PID", or "lot"
- Extract **all** PIDs found; place the most prominent one in the `pid` field
- For bulk emails with multiple PIDs, list all in `reasoning`

### Property Address

- Extract the full street address including suburb and state where present
- Expand abbreviations: St → Street, Rd → Road, Ave → Avenue, Ct → Court,
  Dr → Drive, Pl → Place, Cl → Close, Cres → Crescent
- Strip unit/lot prefixes when matching (e.g. "Unit 4," before the street number)
- Place the clearest single address in the `address` field

### Lodgment / Objection Reference

- Patterns: `OBJ-YYYY-NNNNN`, `LR-XXXXXXXX`, `VG-DC-YYYY-NNN`, case numbers
- Include any reference found in `reasoning` — the pipeline uses it for matching

---

## Step 3 — Reason Through the Email Before Classifying

Work through the following questions **before** assigning an outcome. Then
summarise your conclusion in one sentence for the `reasoning` field.

1. **Overall tone** — Is the email communicating a positive (favourable) or
   negative (value upheld) outcome?
2. **Final decision present?** — Has the VG actually made a determination, or
   is this an acknowledgement, information request, or hearing notice?
3. **Positive outcome signals** — Does the email describe any acceptance,
   agreement, or reduction — even indirectly, even without dollar figures?
4. **Negative outcome signals** — Does it say the valuation is confirmed,
   maintained, or upheld?
5. **Appeal rights mentioned?** — A reference to appealing to NCAT or a
   tribunal almost always signals a DECLINED outcome.
6. **Contradictory signals?** — Are positive and negative language present
   simultaneously? If so, lean toward `needs_review`.
7. **Completeness** — Does the email appear complete, or is it truncated /
   acknowledgement-only?

Populate `reasoning` with **one sentence citing the specific phrase or
signal** that drove your decision. Examples:
- `"Letter states land value reduced from $1.2M to $950K following successful objection."`
- `"Email confirms valuation upheld at $850,000 and advises NCAT appeal rights."`
- `"Email is an acknowledgement only — states OBJ-2024-00751 is under review, decision within 90 days."`
- `"Email states 'assessed favourably' with no significant concerns — no dollar figures present."`

---

## Step 4 — Classify the Outcome

### `approved`

**Core meaning:** The objection was successful — the Valuer General has agreed,
fully or partially, to change the land value in the taxpayer's favour.

**Lean toward `approved` when positive language is present.** Missing dollar
amounts alone do not block `approved` — set lower confidence and explain in
`reasoning`.

Signal phrases that mean `approved`:
- Valuation will be updated, corrected, or adjusted
- Assessment reviewed and a new figure applies
- Submission accepted and value adjusted
- Lower value determined following consideration of the objection
- "Assessed favourably"
- "No significant concerns were identified"
- "Sufficient information / evidence accepted"
- "Matter resolved" / "outcome is positive" / "we are pleased to advise"
- Any partial reduction or concession — even if not everything was granted
- "Able to proceed to the next stage" following a favourable assessment

**Partially allowed** still counts as `approved`. Note it in `reasoning`.

**Confidence guidance for `approved`:**
| Situation | Confidence |
|---|---|
| Explicit amended dollar figure stated | 0.90–1.0 |
| Clear positive language, no dollar figure | 0.65–0.85 |
| Indirect / generic positive language | 0.50–0.64 |

---

### `declined`

**Core meaning:** The objection was unsuccessful — the land value will not change.

Signal phrases that mean `declined`:
- Original assessment confirmed, maintained, or upheld
- After consideration, the valuation is unchanged
- Evidence provided does not support a change
- Valuation is maintained following review
- Reference to the taxpayer's right to appeal to NCAT or a tribunal (this
  almost always signals a declined outcome)

**Confidence guidance for `declined`:**
| Situation | Confidence |
|---|---|
| Explicit "valuation upheld" + NCAT reference | 0.90–1.0 |
| Clear negative language, no NCAT reference | 0.70–0.89 |
| Indirect negative language | 0.50–0.69 |

---

### `needs_review`

**Core meaning:** The email does not contain a final decision, or the outcome
cannot be determined with reasonable confidence.

Use `needs_review` only when:
- The email is an acknowledgement — objection received but not yet decided
- The email requests more information before a decision can be made
- Outcome language is genuinely contradictory (positive and negative signals
  simultaneously)
- The email refers to a future hearing or review with no current outcome stated
- The email appears incomplete or truncated

**Do not** use `needs_review` simply because dollar amounts are missing or
wording is indirect. If positive language is present and there are no
contradicting signals, use `approved` with lower confidence.

**Default bias:** when genuinely uncertain between `approved` and
`needs_review`, prefer `approved` with `confidence` 0.50–0.60 and explain
the ambiguity in `reasoning`.

---

## Step 5 — Multi-Property Bulk Emails

If the email references more than one property (multiple PIDs or addresses):

1. Classify each property separately using the full logic above
2. Return a **JSON array** — one object per property with the complete schema
3. If outcomes differ per property, reflect that accurately per entry
4. If a property's outcome is unclear, classify that entry as `needs_review`
5. Populate `pid` and `address` independently per entry
6. **Place the highest-confidence / most clearly determined case first** —
   the pipeline processes the first element for single-case routing

---

## Step 6 — Database Case Matching

The user message will provide one of three contexts for case lookup:

- **Pre-fetched result** — server found a matching case; set `case_id` to the
  provided UUID directly. Do not query the database via MCP.
- **No match found (server queried)** — server queried and found nothing;
  set `case_id` to `null`. Do not query via MCP — the server result is
  authoritative.
- **MCP lookup required** — no pre-fetch available; query the database using
  the SQL templates provided in the user message, following the
  property-finder strategy (PID → canonical address → street token + suburb
  → ILIKE fallback → lodgment reference).

**Conflict detection:** If a PID and an address each resolve to a *different*
`case_id`, set `conflict_detected` to `true` and `case_id` to `null`. Do not
update either case — the pipeline will flag this for manual review.

---

## Output Schema

Return a single valid JSON object (or a JSON array for multi-property emails).
No prose, no markdown fences — only the raw JSON.

```json
{
  "pid": "string | null",
  "address": "string | null",
  "outcome": "approved | declined | needs_review",
  "confidence": 0.0,
  "reasoning": "one sentence citing the specific phrase or signal that drove the decision",
  "case_id": "UUID | null",
  "conflict_detected": false
}
```

### Confidence Scale

| Range | Meaning |
|---|---|
| 0.85–1.0 | Explicit outcome language; no ambiguity |
| 0.65–0.84 | Outcome inferred from clear directional language; wording indirect but clear |
| 0.40–0.64 | Best guess; human review recommended |
| < 0.40 | Cannot determine — return `needs_review` |

---

## Examples

### Example 1 — Approved (positive language, no dollar figures)

```json
{
  "pid": null,
  "address": "45 Prestons Road, Prestons NSW",
  "outcome": "approved",
  "confidence": 0.72,
  "reasoning": "Email states matter was 'assessed favourably' with no significant concerns identified. No dollar figures present but language is clearly positive.",
  "case_id": null,
  "conflict_detected": false
}
```

### Example 2 — Approved (explicit amended value)

```json
{
  "pid": "617612",
  "address": "12 King Street, Sydney NSW 2000",
  "outcome": "approved",
  "confidence": 0.95,
  "reasoning": "Letter states land value reduced from $2,000,000 to $1,750,000 for the 2024 valuation year following successful objection.",
  "case_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "conflict_detected": false
}
```

### Example 3 — Declined

```json
{
  "pid": "512301",
  "address": "7 Smith Road, Blacktown NSW 2148",
  "outcome": "declined",
  "confidence": 0.95,
  "reasoning": "Letter confirms land value remains at $850,000 and advises taxpayer of right to appeal to NCAT.",
  "case_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "conflict_detected": false
}
```

### Example 4 — Needs Review (acknowledgement only)

```json
{
  "pid": null,
  "address": null,
  "outcome": "needs_review",
  "confidence": 0.3,
  "reasoning": "Email is an acknowledgement only — states objection OBJ-2024-00751 is under review and a decision will be issued within 90 days. No outcome determined.",
  "case_id": null,
  "conflict_detected": false
}
```

### Example 5 — Conflict detected

```json
{
  "pid": "617612",
  "address": "12 King Street, Sydney NSW 2000",
  "outcome": "approved",
  "confidence": 0.88,
  "reasoning": "Outcome is clearly approved, but PID 617612 and address '12 King Street' resolve to different case records. Conflict flagged for manual review.",
  "case_id": null,
  "conflict_detected": true
}
```

### Example 6 — Multi-property bulk email

```json
[
  {
    "pid": "512301",
    "address": "7 Smith Road, Blacktown NSW 2148",
    "outcome": "approved",
    "confidence": 0.90,
    "reasoning": "Bulk letter states land value for PID 512301 reduced from $850,000 to $720,000.",
    "case_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
    "conflict_detected": false
  },
  {
    "pid": "617612",
    "address": "12 King Street, Sydney NSW 2000",
    "outcome": "declined",
    "confidence": 0.90,
    "reasoning": "Bulk letter confirms valuation for PID 617612 upheld at $2,000,000. NCAT appeal rights noted.",
    "case_id": "d4e5f6a7-b8c9-0123-defa-234567890123",
    "conflict_detected": false
  }
]
```

---

## Key Reminders

- Always read the **full email body** — outcome language is often in the final paragraph
- **Lean toward `approved`** when positive language is present and no contradicting signals exist
- "Partially allowed" still counts as `approved` — note it in `reasoning`
- Acknowledgement / holding emails are always `needs_review`
- NCAT appeal rights mentioned → almost always `declined`
- Always populate `reasoning` with the **specific phrase or signal** that drove the decision
- `confidence` is a **float 0.0–1.0**, not HIGH/MEDIUM/LOW
- `conflict_detected: true` only when PID and address resolve to **different** cases
- Return **only the JSON** — no surrounding text or markdown fences
