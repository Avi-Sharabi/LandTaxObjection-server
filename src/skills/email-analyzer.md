---
name: nsw-vg-email-classifier
description: >
  Use this skill to classify emails related to NSW Valuer General (VG) land tax
  objections as APPROVED, DECLINED, or FOR_REVIEW. Always trigger when the
  user pastes or uploads an email from the NSW VG, Revenue NSW, or any related
  body about a land tax objection outcome. Also trigger when the user asks to
  "classify", "check", "read", or "process" any objection response email —
  even if they don't say "land tax" explicitly.
---

# NSW VG Land Tax Objection — Email Classifier

This skill analyses an email containing a response to a NSW Valuer General
(VG) land tax objection and returns a structured JSON classification:
**APPROVED**, **DECLINED**, or **FOR_REVIEW**.

---

## When to Use This Skill

- User pastes or uploads an email from the NSW VG, Revenue NSW, or a related
  body regarding a land tax objection
- User wants to know the outcome of an objection without reading the full email
- User is processing multiple objection emails in bulk

---

## Step 1 — Extract the Email Content

Accept the email in any of these forms:
- Pasted plain text
- Uploaded `.txt`, `.eml`, or `.pdf` file (see Step 1A for PDF handling)
- Forwarded email body in the chat

Read the full email before classifying. Do not classify based on subject line alone.

### Step 1A — PDF Attachment Handling

If the user uploads a `.pdf` file, treat it as the primary email content:

1. Extract all text from the PDF before classifying
2. If the PDF contains a cover letter **plus** an attached determination notice,
   read **both** — the determination notice typically contains the binding outcome
3. If the PDF appears to be a scanned image (no selectable text), flag this in
   `notes` and set `confidence` to `LOW`
4. If the PDF contains multiple pages, read all pages — outcome language often
   appears on the last page
5. If text extraction fails or the PDF is corrupted, return:
```json
{
  "status": "FOR_REVIEW",
  "confidence": "LOW",
  "notes": "PDF could not be read. Manual review required."
}
```

---

### Step 1B — Non-English Email Handling

If the email is written in a language other than English (e.g. Mandarin, Arabic,
Vietnamese, Korean):

1. **Translate the full email to English first** before applying any classification logic
2. Apply all standard classification rules to the translated content
3. Note the original language in the `notes` field
4. Set `confidence` one level lower than you would for an equivalent English email
   (HIGH → MEDIUM, MEDIUM → LOW) to account for translation uncertainty
5. If translation confidence is very low (e.g. heavily technical or degraded text),
   set `status` to `FOR_REVIEW` and explain in `notes`

Example note: `"Email originally in Mandarin. Translated before classification. Confidence reduced by one level due to translation."`

---

### Step 1C — Multi-Property Email Handling

If the email references **more than one property address** (e.g. a bulk
determination letter covering multiple lots):

1. **Classify each property separately** — do not produce a single classification
   for the whole email
2. Return a **JSON array** instead of a single JSON object, with one entry per
   property
3. Each entry follows the standard schema and must include its own `property_address`,
   `status`, `confidence`, and all other fields
4. If the outcome differs per property (e.g. one approved, one declined), reflect
   that accurately in each entry
5. If a property is mentioned but its outcome is unclear, classify that entry as
   `FOR_REVIEW`

**Multi-property output schema:**
```json
[
  {
    "status": "APPROVED",
    "confidence": "HIGH",
    "property_address": "12 King Street, Sydney NSW 2000",
    "original_land_value": "$2,000,000",
    "amended_land_value": "$1,750,000",
    "valuation_year": "2024",
    "decision_date": "2025-04-01",
    "objection_reference": "OBJ-2024-00101",
    "partially_allowed": false,
    "further_action_required": false,
    "notes": null
  },
  {
    "status": "DECLINED",
    "confidence": "HIGH",
    "property_address": "88 Queen Street, Melbourne VIC 3000",
    "original_land_value": "$1,500,000",
    "amended_land_value": null,
    "valuation_year": "2024",
    "decision_date": "2025-04-01",
    "objection_reference": "OBJ-2024-00102",
    "partially_allowed": false,
    "further_action_required": false,
    "notes": "Valuation upheld. Taxpayer advised of right to appeal to NCAT."
  }
]
```

> If the email contains only one property, always return a single JSON object
> (not an array) to maintain backward compatibility.

---

## Step 2 — Classify the Outcome Using Semantic Reasoning

Do **not** scan for exact phrases. Instead, read and understand the full meaning
of the email and ask: *"What has the Valuer General actually decided?"*

The classification must be based on the **intent and outcome** communicated —
regardless of the specific words used. Government correspondence frequently
paraphrases, uses passive voice, or describes the outcome indirectly. Your job
is to understand what happened, not match a keyword.

> **Lean toward APPROVED.** When an email uses clearly positive language and
> there is no explicit signal that the objection was rejected or is still
> pending, classify as APPROVED with MEDIUM confidence. Reserve FOR_REVIEW
> only for genuine uncertainty (e.g. acknowledgement-only emails, requests for
> more information, or contradictory signals).

---

### APPROVED
**Core meaning:** The objection was successful — the Valuer General has agreed,
fully or partially, to change the land value in the taxpayer's favour. OR the
email communicates a clearly positive outcome using favourable language, even
if exact dollar amounts are not stated.

Ask yourself: *Does the email communicate a positive outcome, acceptance, or
agreement — even indirectly?*

If yes → **APPROVED**.

This includes emails that say things like:
- The valuation will be updated or corrected
- The assessment has been reviewed and a new figure applies
- The submission has been accepted and the value adjusted
- A lower value has been determined following consideration of the objection
- Any partial reduction or concession — even if not everything was granted
- **"Assessed favourably"** — treat this as APPROVED
- **"Able to proceed to the next stage"** following a favourable assessment — treat as APPROVED
- **"No significant concerns were identified"** — treat as APPROVED
- **"Sufficient information / evidence accepted"** — treat as APPROVED
- **"Matter resolved"**, **"outcome is positive"**, **"we are pleased to advise"** — treat as APPROVED
- Any language that conveys acceptance, agreement, or a positive determination,
  even without explicit dollar figures

**Missing dollar amounts do not disqualify APPROVED.** VG correspondence
sometimes communicates approval without stating the amended figure in the same
letter. If the tone and language are clearly positive, classify as APPROVED
and set `amended_land_value` to `null`.

---

### DECLINED
**Core meaning:** The objection was unsuccessful — the Valuer General has
reviewed the matter and the land value will not change.

Ask yourself: *Does the email communicate that the original valuation stands,
or that no change will be made?*

If yes → **DECLINED**.

This includes emails that say things like:
- The original assessment has been reviewed and is confirmed
- After consideration, the valuation is maintained
- The evidence provided does not support a change
- The submission has been considered but the value is upheld
- Reference to the taxpayer's right to appeal (e.g. to NCAT) — this almost
  always signals a declined outcome

---

### FOR_REVIEW
**Core meaning:** The email does not contain a final decision, or the outcome
cannot be determined with reasonable confidence.

Ask yourself: *Is there a clear outcome communicated, or is this still in
progress / unclear?*

Use **FOR_REVIEW** only when:
- The email is an acknowledgement only — the objection has been received but
  not yet decided
- The email requests more information before a decision can be made
- The outcome language is genuinely contradictory (positive and negative signals
  present simultaneously)
- The email refers to a future hearing, determination, or review — with no
  indication of a current outcome
- The email appears incomplete or truncated

**Do not use FOR_REVIEW simply because dollar amounts are missing, or because
the wording is indirect or generic.** If positive language is present and there
are no contradicting signals, classify as APPROVED with MEDIUM or LOW
confidence rather than defaulting to FOR_REVIEW.

---

### Reasoning Before Classifying

Before assigning a status, briefly reason through:
1. What is the overall tone of the email — positive (favourable outcome) or
   negative (no change)?
2. Is there a final determination, or is this still in progress?
3. Does the email describe any positive outcome, even indirectly or without figures?
4. Are there any contradictory signals that make the outcome genuinely unclear?

Use this reasoning to assign the most accurate status and the appropriate
confidence level (HIGH / MEDIUM / LOW).

**Default bias: when in doubt between APPROVED and FOR_REVIEW, choose APPROVED
with MEDIUM or LOW confidence and note the ambiguity in the `notes` field.**

---

## Step 3 — Extract Supporting Details

Along with the classification, extract these fields where present:

| Field | Description |
|---|---|
| `property_address` | Address of the subject property |
| `original_land_value` | Land value before objection (if stated) |
| `amended_land_value` | New land value after objection (if stated) |
| `valuation_year` | The 1 July valuation year the objection relates to |
| `decision_date` | Date of the decision letter |
| `objection_reference` | Any reference or case number in the email |
| `partially_allowed` | true/false — if only part of the objection was granted |
| `further_action_required` | true/false — if the email mentions next steps needed |
| `notes` | Any important caveats, conditions, or unusual language |

If a field cannot be found in the email, set its value to `null`.

---

## Step 4 — Return JSON Output

Always return the result as a **valid JSON object only** — no prose, no
markdown fences, just the raw JSON.

### Schema

```json
{
  "status": "APPROVED | DECLINED | FOR_REVIEW",
  "confidence": "HIGH | MEDIUM | LOW",
  "property_address": "string | null",
  "original_land_value": "string | null",
  "amended_land_value": "string | null",
  "valuation_year": "string | null",
  "decision_date": "string | null",
  "objection_reference": "string | null",
  "partially_allowed": true | false | null,
  "further_action_required": true | false | null,
  "notes": "string | null"
}
```

### Confidence Levels

| Level | Meaning |
|---|---|
| `HIGH` | Clear outcome language found; no ambiguity |
| `MEDIUM` | Outcome inferred from positive/negative language; wording is indirect but directionally clear |
| `LOW` | Outcome is a best guess; human review recommended |

---

## Example Outputs

### Example 1 — APPROVED (positive language, no dollar figures)

```json
{
  "status": "APPROVED",
  "confidence": "MEDIUM",
  "property_address": "45 Prestons Road, Prestons NSW",
  "original_land_value": null,
  "amended_land_value": null,
  "valuation_year": null,
  "decision_date": null,
  "objection_reference": null,
  "partially_allowed": null,
  "further_action_required": true,
  "notes": "Email states matter was 'assessed favourably' with no significant concerns identified. No dollar figures or objection reference present. Classified as APPROVED based on clearly positive language. Recommend confirming amended value via follow-up."
}
```

### Example 3 — DECLINED

```json
{
  "status": "DECLINED",
  "confidence": "HIGH",
  "property_address": "7 Smith Road, Blacktown NSW 2148",
  "original_land_value": "$850,000",
  "amended_land_value": null,
  "valuation_year": "2023",
  "decision_date": "2025-01-20",
  "objection_reference": "OBJ-2023-01193",
  "partially_allowed": false,
  "further_action_required": false,
  "notes": "Letter states land value remains at $850,000. Taxpayer advised of right to appeal to NSW Civil and Administrative Tribunal (NCAT)."
}
```

### Example 4 — FOR_REVIEW (acknowledgement only)

```json
{
  "status": "FOR_REVIEW",
  "confidence": "LOW",
  "property_address": null,
  "original_land_value": null,
  "amended_land_value": null,
  "valuation_year": "2024",
  "decision_date": null,
  "objection_reference": "OBJ-2024-00751",
  "partially_allowed": null,
  "further_action_required": true,
  "notes": "Email is an acknowledgement only. States objection is under review and a decision will be issued within 90 days. No outcome determined yet."
}
```

---

## Key Reminders

- Always read the **full email body** before classifying — outcome language is
  often in the final paragraph
- **Lean toward APPROVED** when positive language is present and no contradicting
  signals exist — missing dollar amounts alone do not block APPROVED
- "Partially allowed" still counts as **APPROVED** — note it in `partially_allowed`
  and `notes`
- Acknowledgement or holding emails are always **FOR_REVIEW**, never APPROVED
  or DECLINED
- If the email mentions an appeal right (e.g. NCAT), the decision is almost
  always **DECLINED**
- Dollar amounts may appear as `$1,200,000` or `$1.2M` — normalise to full
  dollar format in the JSON
- **PDF emails** — read all pages; if scanned/unreadable, return FOR_REVIEW with LOW confidence
- **Non-English emails** — translate first, then classify; reduce confidence by one level
- **Multi-property emails** — return a JSON array with one entry per property
- Return **only the JSON** — no surrounding text, explanation, or markdown fences