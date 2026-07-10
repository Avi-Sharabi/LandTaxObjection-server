# Data Schema — matter input contract

The build script (`scripts/build_report.py`) consumes one JSON object describing
the matter. Start from `examples/melia_court.json` and replace the values. Field
names must match exactly. Provide **raw numbers** for money/area/rate fields —
the script formats them and computes variances, rates, and savings. Strings are
passed through unchanged, so anything pre-formatted (e.g. `"$8,500,000 + GST"`)
also works.

Omit a block (or set it to `null`/`[]`) to drop that part of the report — e.g.
no `planning_proposal` ⇒ section 3.4 is skipped; empty `residual` ⇒ no 5.3.

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
| `cover_facts` | list | `{label, value}` rows of the cover fact table. Never use "Lodged"/"Submitted" here unless `Case status` is `submitted_to_vg` or later — see controlled-vocabulary rules in section_guide.md. |
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
professional assessment. Required whenever comparable evidence supports a figure
(e.g. the most defensible point within the adjusted comparable range, after applying
any identified constraint discount). Distinct from `cpv.methods[]`, which holds an
independent CPV valuer's own results — do not set this to `"UNCONFIRMED"` merely
because CPV confirmation is still pending; that caveat is stated separately (see
`section_guide.md`).

## `cpv` object
- `section_title`, `intro`, `comp_title`, `comp_intro` — strings.
- `methods`: list of `{name, value, suffix?, adopted?, var_class?}`.
  - `value` raw number; script computes `"$X BELOW VG (-Y%)"` vs `valuation.vg_recorded_value`.
  - `suffix` appends in parentheses to the value (e.g. `"excl. GST"`).
  - `adopted: true` renders the **navy** Method label + **green** value cell.
  - `var_class` overrides the auto colour (`v-strong` red / `v-mod` amber).
- `extra_rows`: list of `{label, value, note}` — the non-method rows (implied rate, gross realisation).
- `comp_summary_row`: the navy summary row under the comparables (`ref, date, price, area, zone, rate, comparison` — all strings here). The `ref` value (e.g. `"CPV ADOPTED RANGE"`) spans the # **and** Address columns (colspan=2 in the template); remaining fields map left-to-right to Date → Price → Area m² → Zone → $/m² → CPV Comparison. `price`, `rate`, and `comparison` all support `<br>`/`<strong>` for a stacked range + adopted-value display (e.g. `rate: "$3,034 – $3,640<br><strong>Adopted: $3,371</strong>"`) — `date`/`area`/`zone` are plain text only.
- `rate_analysis`: string → blue analysis callout.

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
- `cpv.comp_summary_row.price`, `.rate`, and `.comparison` — support `<br>` for line breaks

## `comparables[]`
`ref`, `address`, `date`, `zone`, `comparison` (strings). Numbers/overrides:
- `price` (number) → formatted; or set `price_display` to override. `price_suffix` appends (e.g. `"+ GST"`).
- `area_sqm` (number) → `"NN,NNN m²"`; or `area_display` to override (e.g. `"26,500 (13,400 developable)"`).
- `rate_per_sqm` (number) → `"$NNN"`; or `rate_display` to override (e.g. `"$313 gross $619 dev."`). Falls back to `price/area` if absent.
- `highlight: "green"` renders the price in green (mark a superior comp).

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