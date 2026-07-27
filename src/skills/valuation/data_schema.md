# Data Schema — matter input contract

The build script (`scripts/build_report.py`) consumes one JSON object describing
the matter. Start from `examples/melia_court.json` and replace the values. Field
names must match exactly. Provide **raw numbers** for money/area/rate fields —
the script formats them and computes variances, rates, and savings. Strings are
passed through unchanged, so anything pre-formatted (e.g. `"$8,500,000 + GST"`)
also works.

No block is ever omitted from the rendered report — every section always appears, including
`subject.development`, `planning_proposal`, and `residual`. When one of these doesn't apply to
the property (no DA, no rezoning proposal, not a residual-method valuation), set it to
`null`/`[]` exactly as you would for any other missing fact — the section still renders, with
`"-"` in place of content, the same as everywhere else in this document.

For every other list (`cover_facts`, `exec_summary.rows`, `statutory.basis`/`assessment`,
`subject.identification`/`attributes`, `constraints`, `comparables`, `weaknesses`,
`financial_scenarios`, `evidence_checklist`, `action_plan`, `legal_grounds`), never drop a
row just because a fact couldn't be found — include the row with its `value` (or
equivalent field) set to `"-"`. These sections are always relevant to the report; an
empty/missing table reads as an incomplete report, not as "not applicable."

`| safe`: every value rendered into the document allows inline HTML, so you may
use `<strong>…</strong>` and `<br>` inside any string (the narrative grounds use
this). Do not paste untrusted HTML.

## Top-level keys

| Key | Type | Notes |
|---|---|---|
| `meta` | object | Cover/title + dates. See below. |
| `property` | object | `estate_name`, `lots_dps_short`, `area_sqm` (used for cover subtitle). |
| `valuation` | object | `vg_recorded_value` (number) — drives every variance calc and the 5.1 header. |
| `key_finding` | string | Cover green callout body. Do NOT include "KEY FINDING: " — the template prepends it automatically. |
| `cover_facts` | — | **Fully system-generated — omit this key entirely.** The cover fact table (Owner, Property, Property ID, Site Area, Zoning, dates, VG/Our assessed values and implied rates, Variance, Land Tax Payable, Payment Due Date, Case Status) is built server-side from real case data, in a fixed row order, every time. Anything you provide under this key is ignored and replaced. |
| `exec_summary` | object | `intro` (string) + `rows` of `{item, finding}`. → Section 1 |
| `statutory` | object | `basis` and `assessment`, each a list of `{label, value}`. → Section 2 |
| `subject` | object | `identification`, `attributes`, `development` — each `{label, value}` lists. → Section 3 |
| `planning_proposal` | object | `status_word`, `critical_note` (red callout), `rows`. → Section 3.4 (optional) |
| `hbu` | object | `statement` (string). → Section 4.1 |
| `constraints` | list | `{constraint, status, source, impact}`. → Section 4.2 |
| `cpv` | object | Independent-valuation analysis. See below. → Section 5 |
| `comparables` | list | Comparable sales rows. See below. → Section 5.2 |
| `residual` | object | `rows` of `{label, value}`. → Section 5.3 (optional) |
| `weaknesses` | list | `{n, weakness, evidence, argument}`. → Section 6.1 |
| `legal_grounds` | list | `{label, value}`. → Section 6.2 |
| `financial_scenarios` | list | Tax-impact rows. See below. → Section 7 |
| `financial_callouts` | list | `{text, kind}` callouts after the table (`kind`: green/blue/red/amber). |
| `evidence_checklist` | list | `{item, status, notes}` (+ optional `status_class`). → Section 8 |
| `objection_narrative` | object | `intro` + `paragraphs` (list of strings). → Section 9 |
| `action_plan` | list | `{priority, action, how, deadline, status}` (+ optional `status_class`). → Section 10 |
| `disclaimer_paragraphs` | list | Strings. → Section 11 |
| `payment_reminder` | string | Red callout at the very end (optional). |

## `meta`
`title_line1` / `title_line2` / `title_line3` (banner; defaults supplied),
`headline_address` (required), `valuation_date`, `land_tax_year`, `report_date`,
`confidentiality` (footer banner text).

**`valuation_date` and `land_tax_year` are server-computed, not yours to derive.** The user
message includes explicit lines — `"System-computed relevant valuation date: ..."` and
`"System-computed land tax year: ..."` — sourced from the real valuation notice on file, not
inferred from context. Copy those two values verbatim into `meta.valuation_date` and
`meta.land_tax_year`. Never recompute them from the "1 July of the year before the land tax
year" rule yourself, and never state a different date/year anywhere else in the report
(Section 1, Section 2.1, Section 9 narrative, etc.) — the system overwrites these two `meta`
fields after generation regardless of what you write, so a mismatched figure elsewhere in your
own prose is the only way this ends up inconsistent within one report.

**Omit `title_line1` and `title_line2` in the large majority of reports** — let the template's
fixed defaults ("NSW STATUTORY LAND VALUATION" / "APPRAISAL & OBJECTION ASSESSMENT REPORT")
render, rather than inventing new top-line wording each time. `title_line3` is the one banner
line meant to vary per report — use it for a case-specific tag (e.g. a case reference or an
edition label like "FINAL CONSOLIDATED EDITION") when there's a genuine reason to add one.

## `valuation`
`vg_recorded_value` (number) — drives every variance calc and the 5.1 header.
`vg_recorded_short` (string, optional) — abbreviated form shown in the 5.1 column header
(e.g. `"$20.8M"`). Falls back to the full formatted value if omitted.
`contended_value` (number) — the preparer's own concluded land value, based on the
comparable-sales investigation performed in this report, stated as this firm's
professional assessment. Distinct from `cpv.methods[]`, which holds an independent CPV
valuer's own results — do not set this to `"UNCONFIRMED"` merely because CPV confirmation
is still pending; that caveat is stated separately (see `section_guide.md`).

**Methodology — fixed, do not deviate (this determines the number, not the model's discretion):**
1. Take the `$/m²` rate of every full-interest, non-outlier comparable sale on file for this
   case — not just the subset you choose to display in `comparables[]`, and never including a
   comparable marked EXCLUDED in the prompt's Status column (part-interest sale or statistical
   outlier — those are excluded from this step regardless of whether you also show them in the
   table for transparency).
2. Compute the **median** of those rates (not the mean, not a point "somewhere in the range,"
   not the ceiling or floor of the range) — this is the starting rate.
3. If a constraint identified in `constraints[]` carries a `Major`/`Negative` valuation impact
   (e.g. flood-planning-area affectation), apply a downward adjustment from the median rate and
   state the adjusted rate and the reasoning in `cpv.rate_analysis` — do not apply a discount that
   isn't traceable to a specific constraint already in the register.
4. `contended_value` = the resulting rate × the site area used elsewhere in this report (the
   same area — extracted from the uploaded NSW Valuer General Land Value Search document,
   AI-extracted rather than independently confirmed — used in `subject.identification`/`meta`,
   not a different figure).
This is a fixed procedure precisely so that re-running this report on the same comparable
evidence produces the same figure every time — never pick a different point in the range on a
subsequent run of the same data. The resulting rate (step 2/3) is also what populates the
cover's "Our Implied Rate ($/m²)" row (see `cover_facts` above and section_guide.md) — that
figure and `cpv.rate_analysis`/`comp_summary_row.rate` in Section 5 must never disagree.

**Server enforcement note**: `cover_facts` "Our Assessed Value" / "Our Implied Rate ($/m²)" and
this `contended_value` field are computed server-side (median of the persisted comparable
`$/m²` rates × site area, **after excluding part-interest sales and statistical outliers** —
steps 1, 2, and 4 above) and force-overwritten after you generate your response, regardless of
what you write. **Step 3 (the constraint-based downward
adjustment) is not applied automatically anywhere** — there is no severity/dollar signal on
file to derive a numeric discount from. You may still discuss in `cpv.rate_analysis` that a
constraint could justify further reduction and recommend manual/CPV review, but do not state a
different final adopted rate there (or anywhere else) than the server-enforced figure — the
narrative and the enforced number must never disagree.

**If `comparables[]` is empty or does not support a defensible figure** (no comparable-sales
investigation could be performed for this case, or the sales found all trade above the VG's own
implied rate with none supporting a lower value), set `contended_value` to the string `"-"` —
the same closed-vocabulary value used for any other fact that couldn't be established — rather
than a number, `null`, `"UNCONFIRMED"`, or any invented placeholder such as `"TBD"`. Every other
part of the report that normally mirrors this figure (the "Our Assessed Value" cover row, the
Section 1 exec-summary row, the `cpv.extra_rows` "Firm's Assessed Value" entry) is **always
included, never dropped** — same as every other row in this report — and simply shows `"-"` when
`contended_value` is `"-"`. The Section 6.2 primary-ground narrative is the one exception: see
`section_guide.md` for how to phrase that sentence when there's no figure to state.

## `cpv` object
- `section_title`, `intro`, `comp_title`, `comp_intro` — strings.
- `methods`: list of `{name, value, suffix?, adopted?, var_class?}`.
  - `value` raw number; script computes `"$X BELOW VG (-Y%)"` vs `valuation.vg_recorded_value`.
  - `suffix` appends in parentheses to the value (e.g. `"excl. GST"`).
  - `adopted: true` renders the **navy** Method label + **green** value cell.
  - `var_class` overrides the auto colour (`v-strong` red / `v-mod` amber).
- `extra_rows`: list of `{label, value, note}` — the non-method rows (implied rate, gross realisation).
- `comp_summary_row`: the navy summary row under the comparables (`ref, date, adjusted_value, area, zone, rate, comparison` — all strings here). This is a synthetic aggregate row, not a real comparable, so it has no `sale_price` — the template renders its Sale Price cell as a fixed `-`. The `ref` value (e.g. `"CPV ADOPTED RANGE"`) spans the # **and** Address columns (colspan=2 in the template); remaining fields map left-to-right to Date → Adjusted Value → Area m² → Zone → $/m² → CPV Comparison. `adjusted_value`, `rate`, and `comparison` all support `<br>`/`<strong>` for a stacked range + adopted-value display (e.g. `rate: "$3,034 – $3,640<br><strong>Adopted: $3,371</strong>"`) — `date`/`area`/`zone` are plain text only.
- `rate_analysis`: string → blue analysis callout. Show the arithmetic behind the adopted rate,
  not just the conclusion: list each comparable's $/m² rate used and the computed median
  explicitly, then any constraint-based adjustment, then the final adopted rate — see
  section_guide.md §5.

## HTML-safe fields — inline color spans

Several fields render with `| safe` in the template, allowing inline HTML for colored text.
Available utility classes (apply as `<span class="CLASS">text</span>`):
- `txt-amber` — amber warning text (#7B4F00, bold) — use for risk labels, current-VG rows, UNCONFIRMED status
- `txt-green` — positive green text (#375623, bold) — use for recommendations, CONFIRMED status
- `txt-red`   — critical red text (#9C0006, bold) — use for REFUSED/URGENT status

**Fields that accept inline HTML:**
- `exec_summary.rows[].item` — use amber/green spans for risk/positive labels
- `constraints[].status` — use colored spans for CONFIRMED (green), REFUSED (red), UNCONFIRMED (amber). "CONFIRMED" requires EVIDENCE_OBTAINED/CLIENT_CONFIRMED verification (see controlled-vocabulary rules in section_guide.md) — otherwise use "AI-DETECTED — NOT YET VERIFIED" (amber)
- `financial_scenarios[].scenario` — use amber spans for current-VG baseline rows
- `cpv.comp_summary_row.adjusted_value`, `.rate`, and `.comparison` — support `<br>` for line breaks

## `comparables[]`
`ref`, `address`, `date`, `zone`, `comparison` (strings). Numbers/overrides:
- `sale_price` (number) → the real contract-of-sale transaction amount. **This field is
  force-overwritten server-side from the actual database record for any row whose `ref` matches
  a comparable you were shown in the prompt** — whatever you write here is only a fallback for
  an unmatched row (which should not normally happen; never invent one). Do not confuse this
  with `adjusted_value` below — they are deliberately separate fields.
- `adjusted_value` (number) → this firm's derived/adjusted bare-land-value figure (after
  stripping improvements, time/size/constraint adjustments) → formatted; or set
  `adjusted_value_display` to override.
- `area_sqm` (number) → `"NN,NNN m²"`; or `area_display` to override (e.g. `"26,500 (13,400 developable)"`).
- `rate_per_sqm` (number) → `"$NNN"`; or `rate_display` to override (e.g. `"$313 gross $619 dev."`). Falls back to `adjusted_value/area` if absent.
- `highlight: "green"` renders the adjusted value in green (mark a superior comp).
- `quarantined` (boolean) + `quarantine_reason` (string) — set both, copying the exact reason
  text given in the prompt's Status column, for any comparable already marked EXCLUDED there.
  These are also force-enforced server-side; this is for the model to render the in-table
  footnote/flag correctly. Do not set `quarantined: true` on a row the prompt marked INCLUDED,
  and never cite an EXCLUDED row's rate as part of the median arithmetic in `cpv.rate_analysis`.

## `financial_scenarios[]`
`scenario`, `basis` (strings); `taxable_value`, `land_tax` (numbers, formatted whole-dollar).
`saving`: a **number** → renders `"~$X"` in green; a **string** (e.g. `"—"`,
`"N/A — objection target"`) → passed through. `emph: true` renders the whole row
navy (use for the strongest scenario). The script does **not** compute land-tax
amounts — supply them from the assessment notice.

## Auto-derived status colours (override with `status_class`)
`st-ok` (green): AVAILABLE / CONFIRMED / TARGET / DONE.
`st-pending` (amber): PENDING.
`st-urgent` (red): contains URGENT / LODGE, or status == DUE.

**`evidence_checklist[].status` and `action_plan[].status` MUST be built only from this
vocabulary** — `AVAILABLE`, `CONFIRMED` (optionally qualified, e.g. `"CONFIRMED IN CPV"`),
`PENDING` (optionally suffixed `"— URGENT"` for a genuinely blocking gap), `DUE`, `TARGET`,
`DONE`. Never invent alternate phrasing such as `"Not obtained"`, `"Not yet actioned"`, or
`"Not provided"` — those words don't match any of the rules above, so the cell silently
renders in plain black instead of the color the checklist/action-plan exists to convey. A
missing document is `"PENDING"` (or `"PENDING — URGENT"` if it blocks lodgement), not
`"Not obtained"`.

## Number formatting rules
Whole values → `$20,800,000`; fractional → `$630,764.25`; areas →
`45,288 m²`; `$/m²` column → bare `$446`. Pass a pre-formatted string anywhere
the automatic format isn't what you want.

## `evidence_strength_score` / `evidence_strength_rationale`

Not part of this JSON contract. `evidence_strength_score`/`evidence_strength_rationale`
are computed deterministically in code by `calculateEvidenceStrengthScore` (see
`src/api/dispute-cases/evidence-score.util.ts`, implementing the rubric in
`src/skills/evidence-score.md`) directly from the Supporting Evidence Issues,
Comparable Sales, and Objection Grounds rows — Claude is not asked to produce
these fields and never sees this section of the rubric.