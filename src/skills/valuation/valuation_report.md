---
name: nsw-land-valuation-objection-report
description: >
  Use this skill to generate a polished, branded NSW Statutory Land Valuation
  Appraisal & Objection Assessment Report as a PDF. ALWAYS trigger when the
  user wants to produce, build, draft, or reproduce a land tax objection
  report, a Valuer General (VG) objection report, a statutory land valuation
  appraisal report, a CPV objection assessment, or "the Melia-style report" —
  for any NSW property. Also trigger whenever the user provides structured
  matter data (property details, VG value, CPV value, comparable sales, land
  tax figures) and asks for it to be turned into the formatted report PDF, even
  if they don't say the word "report". This skill owns the OUTPUT FORMAT and
  DESIGN; for sourcing/screening the comparable sales that feed Section 5, use
  the companion `nsw-land-tax-comparables` skill first.
---

# NSW Land Valuation — Objection Assessment Report Generator

This skill produces the canonical YML **NSW Statutory Land Valuation Appraisal &
Objection Assessment Report** as a faithfully-styled PDF (US Letter, Arial). It
is data-driven: the user supplies a structured JSON dataset for the matter, and
a deterministic Jinja2 → WeasyPrint pipeline renders the report so every report
comes out with the exact same design as the reference document.

The reference matter (1020 Melia Court, Castle Hill) ships as a worked example
in `examples/melia_court.json`. Any other NSW matter is produced by supplying
the same data shape with different values.

## What you produce

A single multi-section PDF with this fixed structure. No section is ever
omitted, including the DA / planning proposal parts of Section 3 and the
Section 5.3 residual cash flow — every section always renders; a row (or a
whole subsection) whose fact doesn't apply or couldn't be found still appears,
with its value as `"-"` rather than being dropped:

1. Executive Summary
2. Statutory Framework and Assessment Details (basis/dates + tax breakdown)
3. Subject Property — Confirmed Data (identification, attributes, DA, planning proposal)
4. Highest and Best Use and Constraint Register
5. Independent Valuation (CPV) Report Analysis (results, comparable sales, residual cash flow)
6. VG Assessment vs CPV — Weaknesses and Legal Grounds
7. Projected Financial Impact
8. Formal Objection Package — Evidence Checklist
9. Formal Objection Narrative
10. Priority Action Plan
11. Professional Disclaimer

## Files in this skill

```
nsw-land-valuation-objection-report/
├── SKILL.md                      ← you are here
├── assets/
│   └── report_template.html.j2   ← the design system + 11-section template (DO NOT restyle)
├── scripts/
│   └── build_report.py           ← loads JSON, computes derived figures, renders PDF
├── references/
│   ├── data_schema.md            ← the full input contract: every field, with types & notes
│   └── section_guide.md          ← what content belongs in each section + legal/calc rules
└── examples/
    └── melia_court.json          ← fully-worked reference dataset (1020 Melia Court)
```

## Workflow — follow in order

1. **Read `references/data_schema.md`.** It is the authoritative input contract.
   Do not guess field names — the build script expects them exactly.
2. **Assemble the matter dataset as JSON.** The user supplies the data each
   time. If they give it as prose or a part-filled form, map it onto the schema
   yourself and confirm anything ambiguous. Start from
   `examples/melia_court.json` as a template and replace the values.
   - Provide raw numbers for money/area fields (e.g. `20800000`, `45288`); the
     script formats them (`$20,800,000`, `45,288 m²`). Strings already formatted
     also pass through.
   - No section is ever left out — this includes `subject.development`,
     `planning_proposal`, and `residual`. When one of these doesn't apply to the
     property, set it to `null`/`[]` and the subsection still renders with `"-"`.
     For every list, never drop a row for a fact you couldn't find — include the
     row with its value set to `"-"` instead.
3. **Run the build script:**
   ```bash
   pip install jinja2 weasyprint --break-system-packages   # only if not present
   python scripts/build_report.py <matter.json> -o <output.pdf>
   ```
   The script computes derived values (variance $ and %, implied $/m² rates,
   comparable $/m², scenario savings), applies conditional formatting, renders
   the Jinja2 template, and writes the PDF. It also writes a sibling `.html` for
   inspection. Read `references/section_guide.md` if you need the calc rules.
4. **Verify, then present the PDF** with `present_files`. For a quick visual
   QA, rasterize a page (`pdftoppm -jpeg -r 110 -f 1 -l 1 out.pdf /tmp/q`) and
   check the banner, callout, and a conditional-format table look right.

If `weasyprint`/`jinja2` cannot be installed in the environment, render the HTML
the same way and convert with the user's own toolchain — but the default and
preferred engine is WeasyPrint, chosen for self-contained CSS fidelity.

## Design system — reproduce exactly, never redesign

All styling lives in `assets/report_template.html.j2`. The look is fixed; do not
substitute fonts, colours, or layout. Palette (sampled from the reference PDF):

| Role | Colour |
|---|---|
| Navy — title banner, section headers, table headers, emphasis rows | `#1F3864` |
| Steel blue — subsection headers | `#2E75B6` |
| Green — positive / adopted (fill / text / border) | `#E2EFDA` / `#375623` / `#70AD47` |
| Red — large variance & critical callouts (fill / text) | `#FCE4D6` / `#9C0006` |
| Amber — moderate variance (fill / text) | `#FFF3CD` / `#7B4F00` |
| Blue — info / analysis callouts | fill `#D6E4F0`, text `#1F3864` |
| Borders | `#CCCCCC` |  Body text | `#222222` |

Font is `Arial, "Liberation Sans", sans-serif` (Liberation Sans is the
metric-identical Arial substitute, so output matches on Linux and on the
client's machine). Page is US Letter with ~25/19 mm margins. The cover is page 1
(navy title banner → headline address → green KEY FINDING callout → key-facts
table → light-blue CONFIDENTIALITY banner); content flows from page 2.

### Conditional formatting rules (applied by the build script)

- **Variance vs VG:** a CPV figure ≥ 50% below VG renders **red** (`v-strong`),
  25–50% renders **amber** (`v-mod`). These thresholds reproduce the reference
  (−54.3% = red, −39.9%/−34.6% = amber). Override per-row with `var_class` if needed.
- **Adopted value:** the adopted CPV value cell is **green** (`v-pos`) and its
  Method label cell is a **navy emphasis cell**.
- **Comparable prices/rates:** bold black by default; set a comparable's
  `price_class` to `txt-green` to highlight a superior comp (as C2 is in the example).
- **Summary/adopted table rows:** set `emph: true` (financial scenarios) or use
  `comp_summary_row` (comparables) to render a full **navy** row.
- **Callouts:** `green` = key/positive finding, `red` = critical/warning,
  `blue` = analytical note, `amber` = caution.

## Domain guardrails

- Statutory grounds are real: primary objection ground is **s.34(1)(a) Valuation
  of Land Act 1916 (NSW)** (valuation too high); **s.6A** for impermissible
  speculative rezoning uplift; **s.34(1)(b)** for factual/area error. Keep these
  accurate — see `references/section_guide.md`.
- Land tax figures (taxable value, tax payable, arrears, savings) come from the
  assessment notice and the user's calculation. The script computes savings as
  `current_tax − scenario_tax` when both are supplied; it does **not** invent
  marginal land-tax amounts. If a figure isn't supplied, use `"-"` rather than
  guessing (exception: `financial_scenarios[].taxable_value`/`.land_tax` use
  `null`, not `"-"` or `"UNCONFIRMED"`, when unknown).
- This is an internal objection-support tool, not a substitute for the
  independent CPV report — the disclaimer in section 11 must say so.
- Do not assert facts the user hasn't supplied (zoning, refusal dates, areas).
  Mark unconfirmed-but-present findings as `"UNCONFIRMED"`; use `"-"` only when
  the fact itself could not be found at all.

## Quick test prompts

- "Build the objection report for the Melia Court matter." → render
  `examples/melia_court.json`.
- "Here's the data for a Parramatta land tax objection [JSON/prose] — generate
  the report PDF." → map to schema, run the script, present the PDF.