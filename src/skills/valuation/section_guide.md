# Section Guide — what belongs in each section

## Formatting & Color Conventions

Several JSON fields render with `| safe` (they accept inline HTML). Use these CSS utility classes
to match the reference document's conditional formatting:

| Class | Color | When to use |
|---|---|---|
| `<span class="txt-amber">text</span>` | Amber `#7B4F00`, bold | Risk labels, warnings, UNCONFIRMED status, current-VG baseline rows |
| `<span class="txt-green">text</span>` | Green `#375623`, bold | Positive recommendation labels, CONFIRMED status, LODGE / TARGET actions |
| `<span class="txt-red">text</span>` | Red `#9C0006`, bold | REFUSED, URGENT, or critical-failure status |

**Apply colored spans in these fields:**
- `exec_summary.rows[].item` — amber for any risk/uncertainty item (planning refusal, overstatement variance, unpaid items, urgent actions); green for positive items ("Objection Recommendation")
- `constraints[].status` — green for `CONFIRMED`/`CONFIRMED LIVE`; red for `CONFIRMED REFUSED`; amber for `UNCONFIRMED`/`PENDING`; no span needed for `NOT IDENTIFIED`/`NOT LISTED`
- `financial_scenarios[].scenario` — amber for current-VG baseline rows (these represent the "problem" figures to be reduced)

Domain guidance for populating an objection report for any NSW matter. The
report is an **internal objection-support tool**; the independent CPV report is
the primary evidence. Keep every figure traceable to a source (CPV report,
assessment notice, planning portal, LRS). Do not assert facts the matter data
doesn't support — mark unconfirmed items "UNCONFIRMED", as the reference does.

## Cover + Section 1 — Executive Summary
The cover repeats the headline numbers; Section 1 gives a one-line `intro` and a
two-column Item/Finding table. Lead with: subject, approved development, planning
status, VG value, CPV value, variance, tax saving, primary legal ground,
recommendation, most-urgent action.

**Voice:** The `intro` field must be an advocate's opening statement, not a
description of the document. Write: "We formally contest the Valuer General's
assessed land value of $[X] as materially excessive. The independent market
evidence supports a value of $[Y] — a [Z%] overstatement of $[diff]. We lodge this
objection on the grounds set out below." Never write "This consolidated
objection-support report analyses…".

## Section 2 — Statutory Framework
- **2.1 basis/dates.** Governing Acts are **Valuation of Land Act 1916 (NSW)**
  and **Land Tax Management Act 1956 (NSW)**. The relevant valuation date is
  **1 July of the year before the land-tax year** (VG bases value on 1 July of
  the preceding year). Objection window is **60 days from the notice issue
  date**. Trusts: note the assessment basis (e.g. **s.3A LTMA** for special
  trusts — $0 threshold).
- **2.2 assessment breakdown.** Take taxable value, per-year recorded values,
  tax, arrears, interest, and total payable directly from the assessment notice.

### Land tax calculation (reference only — supply figures, don't auto-compute)
NSW land tax is marginal and year-specific. For a **special trust** the
reference matter used a flat structure: `rate1 × (premium_threshold − threshold)
+ rate2 × (taxable − premium_threshold)`. Thresholds change annually — always
take the tax amounts from Revenue NSW / the notice. The script computes
**savings** only as `current_tax − scenario_tax` when both are supplied.

## Section 3 — Subject Property
3.1 identification (address, PID, lots/DPs, area, shape, frontage, owner);
3.2 attributes (zoning, height, min lot, FSR, topography, vegetation,
improvements, services, contamination, flood); 3.3 development approval (DA + s.96
modifications, CC, physical commencement, yield, QS cost); 3.4 planning proposal
**only if one exists** — a refused rezoning is a strong s.6A ground, so capture
the reference, decision, date, and the C4-as-at-valuation-date status.

## Section 4 — HBU & Constraints
4.1 states the legally permissible highest-and-best-use **as at the valuation
date** (approved DA, not speculative rezoning). 4.2 is the constraint register:
mark each Major/Negative/Positive/Pending so the impact column reads
consistently. Constraints justify a rate below the VG benchmark.

## Section 5 — Independent (CPV) Valuation Analysis
- **5.1 results:** list each valuation method with its value; mark the adopted
  one `adopted: true`. The script computes variance vs VG and colours it
  (≥50% red, 25–50% amber).
- **5.2 comparables:** for sourcing and screening these sales, use the companion
  **`nsw-land-tax-comparables`** skill first — it covers zoning match, size,
  location, HBU, and sale-date proximity to 1 July. Each row needs a
  "CPV comparison to subject" note (superior/inferior and why). Highlight the
  most-relevant or superior sale in green.
- **5.3 residual cash flow:** include the QS construction cost, contingency,
  fees, contributions, finance, selling costs, margin/IRR, and the residual land
  value — this is the second independent confirmation of the adopted value.
- Close with the **KEY RATE ANALYSIS** blue callout comparing the VG implied
  $/m² to the comparable range.

## Section 6 — Weaknesses & Legal Grounds
6.1 tabulates each VG weakness with Evidence and the Objection Argument.
6.2 states the formal grounds. Standard grounds:
- **s.34(1)(a)** Valuation of Land Act 1916 — *valuation too high* (primary).
- **s.6A** — speculative/anticipated rezoning value is *impermissible*; value at
  HBU as at the relevant date.
- **Constraint oversight** — mass-appraisal benchmark ignores site-specific constraints.
- **s.34(1)(b)** — *factual error* (e.g. recorded area ≠ registered DP area).

**Voice for 6.1:** Write the `argument` column assertively: "We submit the VG
erred by [reason]. The comparable evidence demonstrates [counter-evidence]. The
correct rate is approximately $X/m², not $Y/m² as implied by the assessment."

## Section 7 — Financial Impact
One row per scenario (current VG, and each CPV-based value). Supply taxable value
and land tax per scenario; the strongest scenario gets `emph: true`. Follow with
a green "maximum/conservative saving" callout and a blue interest-arrears note.

## Section 8 — Evidence Checklist
Every item the objection package needs, with a status. The most urgent is
usually the valuer's confirmation letter aligning the CPV to the relevant
valuation date, and the VG Information Kit (the VG's own sales/benchmark).

## Section 9 — Objection Narrative
Ready-to-paste prose for the VG objection form. Open: "We [full entity name]
hereby object to the land value assessed by the Valuer General for [lots] as at
[relevant date], on the following grounds:". One paragraph per ground with a
`<strong>` lead-in. Use "We contend that…", "We submit that…", "The evidence
demonstrates…". Never hedge — this is a formal objection, not exploratory analysis.
Base only on confirmed facts established earlier in the report.

## Section 10 — Priority Action Plan
Numbered actions with how-to, deadline, status. The pay-tax line must stress
that lodging an objection does **not** suspend payment — interest accrues.

## Section 11 — Disclaimer
State that this is an internal assessment tool, **not** a substitute for the CPV
report; that the CPV report must be attached; any "internal reporting only"
limitation on the CPV must be cleared before submission; and sole-use/no-disclosure.
End with the payment reminder (red callout).