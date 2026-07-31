# Data Schema — JSON output contract

Return exactly one JSON object with the keys below, wrapped in a ```json code fence, and nothing else.

Provide **raw numbers** for any numeric field; the server formats them. Every string field renders
with `| safe`, so `<strong>…</strong>` and `<br>` are available inside prose — but never paste
untrusted HTML, and never use a colour span outside the fields listed in `section_guide.md`.

## Two rules that govern the whole contract

**1. Never omit a row because a fact could not be found.** Keep the row and set its value to `"-"`.
The closed vocabulary for something missing is exactly `"-"` (not found at all) or `"UNCONFIRMED"`
(present but not independently verified). No `TBD`, no `TODO`, no `[BRACKETED]`, no `null` standing in
for a value — a report containing any of those is rejected and never delivered.

**2. Keys marked SERVER-BUILT below must be omitted from your output entirely.** They are constructed
from the case record after you return, and anything you write under them is discarded. Do not spend
output tokens on them, and — critically — do not restate their content in your prose either, because
that is the one way this report can end up contradicting itself.

## Top-level keys

| Key | Type | Notes |
|---|---|---|
| `meta` | object | Cover banner + confidentiality. See below. |
| `key_finding` | string | Cover callout, one or two sentences. The single most useful thing to know about this case's evidence. Do not include a "KEY FINDING:" prefix — the template adds it. |
| `cover_facts` | — | **SERVER-BUILT — omit.** |
| `score` | — | **SERVER-BUILT — omit.** The score, band, band range, band description and projected score are all supplied to you in the user message for your reference only. |
| `dashboard` | object | `intro`, `commentary`. → Section 1 |
| `band_narrative` | object | `what_it_means` (list of strings), `out_of_scope` (list of strings). → Section 2 |
| `inventory` | object | Four one-sentence notes. Row lists are **SERVER-BUILT**. → Section 3 |
| `group_deep_dives` | list | Exactly four objects, one per group. → Sections 4-7 |
| `gap_analysis` | list | `{group, missing, why_it_matters, severity}`. → Section 8 |
| `roadmap` | list | `{priority, how, establishes}` **only**. → Section 9 |
| `projected` | object | `narrative`. Figures are **SERVER-BUILT**. → Section 10 |
| `prerequisites` | — | **SERVER-BUILT — omit.** Not-yet-scorable variant only. |
| `disclaimer_paragraphs` | list | Strings. → Section 11 |

## `meta`

| Field | Notes |
|---|---|
| `title_line3` | Optional third banner line. Omit in most reports — the first two lines are fixed server-side. |
| `confidentiality` | Footer banner text, e.g. `"Confidential — prepared for the named client. Not for distribution."` |

`headline_address`, `report_date`, `case_status`, `valuation_date` and `land_tax_year` are all
**server-overwritten** from the case record. Do not supply them and do not restate a different value
for any of them anywhere in your prose.

## `dashboard` → Section 1

| Field | Type | Notes |
|---|---|---|
| `intro` | string | One paragraph. What this score represents for *this* case: the ground actually pleaded, and what carrying that ground requires evidentially. Do not restate the number. |
| `commentary` | string | One paragraph reading the four-row breakdown as a shape — which group carries the case, which contributes least and whether that matters for the ground pleaded. This is where you say, in words, why the points fell where they did. |

`dashboard.rows` is **SERVER-BUILT** from the stored breakdown: group label, points, share of score,
and the stored one-sentence explanation, verbatim. Do not supply it and do not reproduce those four
sentences in `commentary` — expand on them instead.

## `band_narrative` → Section 2

| Field | Type | Notes |
|---|---|---|
| `what_it_means` | list of 2-3 strings | Paragraphs. What a case at this band is like in practice: how an assessor would receive it, what typically still stands between it and the band above. Use the supplied band description as your anchor — the exact band description string is rendered separately by the server, so do not quote it back, elaborate on it. |
| `out_of_scope` | list of 4-6 strings | Short declarative sentences, each naming one thing this score does **not** measure. Must include, in your own words: the likelihood the Valuer General agrees; the dollar tax saving; legal advice or a recommendation to lodge; and the objection deadline. |

## `inventory` → Section 3

Four tables, transcribed from the snapshot in the user message, each with a one-sentence note saying
what the reader should notice — the pattern, not the contents.

Include **every** row the snapshot lists, in the order it lists them. Copy each value exactly as
supplied; where a field is absent, write `"-"`. Formatting: money as `$1,234,567`, areas as `1,234`
(the column header carries the unit), rates as `$1,040`, dates as `9 July 2026`.

| Field | Notes |
|---|---|
| `comparables_note` | e.g. what the included/excluded split means for the contended rate. |
| `comparables` | One row per sale on file: `{ ref, address, area_display, zone, sale_price_display, adjusted_value_display, rate_display, date, status }`. `ref` is the snapshot's `C1`..`Cn` verbatim. `status` is exactly `INCLUDED`, or `EXCLUDED — <reason copied verbatim from _median_status>`. `sale_price_display` is the real contract amount (`purchase_price`); `adjusted_value_display` is the derived bare-land figure (`adjusted_land_value`) — never state one as if it were the other. `rate_display` is `adjusted_rate_per_sqm`, a land-only rate. |
| `grounds_note` | e.g. whether the selected grounds carry articulated findings. |
| `grounds` | One row per ground assessed: `{ ground_number, label, selected, verification_display, note }`. `selected` is `Selected` or `Not selected`. `verification_display` is `CONFIRMED` or `AI-DETECTED — NOT YET VERIFIED` — nothing else. `note` is one short clause: the concession type, or that no finding is recorded, or that no matching portal option exists. `"-"` when there is nothing to say. |
| `issues_note` | e.g. how much of the detected material is verified rather than AI-detected. |
| `issues` | One row per **selected** issue: `{ issue_type, confidence_display, verification_display, documents_to_obtain }`. `documents_to_obtain` is the `documents_to_attach` list joined with `; `, or `None outstanding`. |
| `documents_note` | e.g. which document type would most change the picture. |
| `documents` | One row per document named in the snapshot's Source documents section: `{ name, status, reason }`. `status` is exactly `READ` for one the assessment read, or `NOT READ` for one on file that it did not. `reason` is the classification, or the skip reason copied verbatim. |

Column classes (row shading, status colours) are applied server-side from the exact `status` and
`verification_display` strings above — which is why those two are closed vocabularies rather than free
text. Never write a `class=` attribute of your own.

## `group_deep_dives` → Sections 4-7

Exactly four objects. `label` must be one of `Comparables`, `Reason For Objection`,
`Supporting Evidence`, `Documents`, spelled exactly, one of each. The server joins on `label` and
renders them in that fixed order, so ordering in your array does not matter — but a missing or
misspelled label loses that section's prose.

| Field | Type | Notes |
|---|---|---|
| `label` | string | One of the four. Server-overwritten to the canonical spelling. |
| `points_narrative` | string | One or two paragraphs: what this group contributed and why. For a group at 0, state plainly which of the two zero cases applies — not needed for the ground pleaded, or needed and missing. |
| `strengths` | list of strings | 0-4 items. Each names a specific artefact, row, count, date, rate or instrument. `[]` when the group genuinely has none. |
| `weaknesses` | list of strings | 0-4 items. Same specificity. Never a rule or a threshold — the defect in the evidence. |
| `what_would_change_it` | string | One or two sentences naming the evidence that would most improve this group. Consistent with the roadmap, but written about the group rather than as a task. |

## `gap_analysis` → Section 8

A list of 0-8 objects, ordered most material first.

| Field | Type | Notes |
|---|---|---|
| `group` | string | One of the four labels, spelled exactly. |
| `missing` | string | The evidence that is absent or unverified. Concrete: name the document, the record, the count. |
| `why_it_matters` | string | What this gap costs **the ground actually pleaded**. If it costs it nothing, say so and set `severity` accordingly — that is a legitimate and useful row. |
| `severity` | string | Exactly one of `MATERIAL`, `MODERATE`, `MINOR`, `NOT REQUIRED FOR THIS GROUND`. Any other value renders unstyled. |

Return `[]` only when there is genuinely no gap — rare above the lowest bands, and never true of a
case whose score is below the top band.

## `roadmap` → Section 9

The user message gives you a numbered list of the recommendations already stored on this case, each
with its group, its exact action sentence and its expected lift. Return **one object per numbered
item**, supplying only the two fields you are adding:

| Field | Type | Notes |
|---|---|---|
| `priority` | integer | The number from the supplied list. This is the join key. An item with a `priority` not in the list is dropped; a supplied item you omit renders with the stored action and no "how". |
| `how` | string | One or two sentences: practically, how is this obtained? Name the source — NSW Land Registry Services, the council's s10.7 certificate, a Certified Practising Valuer, the client's own records, the strata manager. Never a URL, phone number or email address. |
| `establishes` | string | One sentence: what having it would establish, in evidence terms — the fact it proves and the group it strengthens. |

`action`, `group` and the expected lift are **SERVER-BUILT** from the stored recommendation. Do not
restate, paraphrase, reorder or re-estimate any of them — the stored sentence is what the application
already shows the user, and it must appear here byte-identical.

Return `[]` when the supplied list is empty.

## `projected` → Section 10

| Field | Type | Notes |
|---|---|---|
| `narrative` | string | One paragraph. What completing the whole roadmap would mean for the case — read as a change in evidentiary position, not as arithmetic. If the projected figure does not cross into a higher band, say so honestly rather than overselling it. Never restate either figure. |

`projected.score`, `.band` and `.total_lift` are **SERVER-BUILT**.

## `disclaimer_paragraphs` → Section 11

3-5 strings. Must cover, in your own words:

- the score reflects only the evidence on file at the report date, and changes as evidence is added;
- expected lift figures are estimates and are neither a guarantee of a higher score nor a commitment
  that the Valuer General will agree;
- figures extracted from client documents by automated steps should be confirmed against the
  originals before being relied on;
- this is not legal, valuation or tax advice.

## Number and string formatting

- Money, areas and rates in prose: match the formatting used in the strings supplied to you
  (`$1,234,567`, `1,234 m²`, `$1,040/m²`). Never introduce a figure of your own for anything the
  server supplied.
- Dates in prose: `9 July 2026` style, matching the supplied strings.
- Sentences in `strengths`, `weaknesses`, `missing`, `how` and `establishes`: aim for under 220
  characters each. They render into table cells.
