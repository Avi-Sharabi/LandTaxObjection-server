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

## Controlled vocabulary — verification & lodgement status (mandatory, do not deviate)

The user message includes a `verification` value alongside each supporting-evidence issue and
each objection ground (`AI_DETECTED_UNVERIFIED`, `EVIDENCE_OBTAINED`, or `CLIENT_CONFIRMED`), and
an explicit `Case status` line near the top. These are the **only** source of truth for the words
below — never infer them from a tick, a confidence score, or the mere existence of a finding.

- **`CONFIRMED` (in `constraints[].status`, or anywhere else) is permitted ONLY when the
  corresponding item's verification is `EVIDENCE_OBTAINED` or `CLIENT_CONFIRMED`.** If verification
  is `AI_DETECTED_UNVERIFIED` — which is the default for essentially every supporting-evidence
  issue in this pipeline, since there is currently no step that obtains corroborating documents for
  them — use `"AI-DETECTED — NOT YET VERIFIED"` (amber) instead of `"CONFIRMED"`, regardless of how
  high the model's own `confidence` value is. `confidence` measures how likely the model thinks the
  fact is true from desktop data; it is not evidence of verification.
- **Section 4.2 (`constraints[]`) and Section 8 (`evidence_checklist`) must agree** on the status of
  the same underlying item. If Section 8 lists a document as `"PENDING"`, the matching Section 4.2
  row must not say `CONFIRMED` for that same finding. (`evidence_checklist[].status` and
  `action_plan[].status` have their own closed vocabulary — see "Auto-derived status colours" in
  `data_schema.md` — never write `"Not obtained"` or similar free text there.)
- **Never use "Lodged" or "Submitted"** (in `cover_facts`, `exec_summary`, `legal_grounds`, or
  anywhere else) to describe objection grounds, evidence, or the objection itself as an act that
  has already happened, UNLESS the `Case status` given in the context is `submitted_to_vg` or a
  later status. Before that, describe grounds as "Proposed", "Selected for objection", or "Grounds
  identified" — never "has been lodged"/"has been submitted". This does NOT restrict the ordinary
  argumentative phrase "We submit that…" (meaning "we contend/assert that…", the advocacy voice
  used throughout Sections 6 and 9) — that usage has nothing to do with filing status. The rule is
  specifically about describing the objection/grounds themselves as already filed with Revenue
  NSW before that has actually happened; it is not a ban on the word "submit" in its ordinary
  argumentative sense.
- **Never write "ticked by client" or "client confirmed"** for an objection ground. There is no
  client-tick mechanism in this system — grounds are ticked by AI/automation only. Use the ground's
  own `verification` value and its `Finding:` text (if present) instead of inventing a confidence
  level or a client-action narrative.
- **Never cite a document by a raw ID, UUID, or internal reference code.** Cite by human-readable
  title and date only (e.g. "NSW Planning Portal Property Report dated 9 July 2026", "the Australian
  Business Register search"). If no real external reference number exists in the supplied data, do
  not invent one — an internal placeholder (e.g. a notice reference beginning `INTAKE-`) is never a
  real Revenue NSW number and must never be echoed as if it were.

Domain guidance for populating an objection report for any NSW matter. This
report **is the objector's submission-ready advocacy package** — write every
section as if presenting the case directly to the Valuer General, not as an
internal working file. The independent CPV market valuation remains the
primary evidentiary attachment that must accompany the lodged objection; this
document organises the argument around it. Internal-only caveats (scope,
limitations, confidentiality) belong solely in Section 11 — nowhere else.
Keep every figure traceable to a source (CPV report, assessment notice,
planning portal, LRS). Do not assert facts the matter data doesn't support —
mark unconfirmed items "UNCONFIRMED", as the reference does; that is a factual-
accuracy rule, not licence to write in a hedging, internal-memo tone.

## Cover + Section 1 — Executive Summary
The cover repeats the headline numbers; Section 1 gives a one-line `intro` and a
two-column Item/Finding table. Lead with: subject, approved development, planning
status, VG value, CPV value, variance, tax saving, primary legal ground,
recommendation, most-urgent action.

**State a contended value, not just a range.** When `valuation.contended_value` is
supplied, state it explicitly in `key_finding` (a specific number, not only "a range
of $X–$Y") and add a dedicated `exec_summary.rows` entry ("Our Assessed Land Value").
This is the firm's own professional assessment from the investigation in this report —
distinct from, and stated in addition to, the note that an independent CPV valuation
will confirm or refine it. Do not mark `contended_value` "UNCONFIRMED" merely because
CPV confirmation is pending — that caveat is a separate sentence, not a reason to avoid
taking a position.

**Deadline/process status goes here once, not throughout.** If the objection window has
lapsed, state it in exactly one place in this section (an amber/red exec-summary row) and
in the Priority Action Plan (Section 10). Do not repeat it as a caveat inside Sections 2–7
or 9 — those sections should read as the substantive case, uninterrupted by process notes.

**Voice:** The `intro` field must be an advocate's opening statement, not a
description of the document. Write in this shape (substituting the case's actual
figures — never leave bracketed placeholder text like this literally in the
output): "We formally contest the Valuer General's assessed land value of
$<VG value> as materially excessive. The independent market evidence supports a
value of $<CPV value> — a <percentage> overstatement of $<difference>. We raise
this objection on the grounds set out below." Never write "This consolidated
objection-support report analyses…", and never write "lodge"/"lodged" here —
see the controlled-vocabulary rule above; this document is prepared in advance
of lodgement, not lodged by virtue of being written.

## Section 2 — Statutory Framework
- **2.1 basis/dates.** Governing Acts are **Valuation of Land Act 1916 (NSW)**
  and **Land Tax Management Act 1956 (NSW)**. The relevant valuation date is
  **1 July of the year before the land-tax year** (VG bases value on 1 July of
  the preceding year). Objection window is **60 days from the notice issue
  date**. Trusts: note the assessment basis (e.g. **s.3A LTMA** for special
  trusts — $0 threshold).
- **2.2 assessment breakdown.** Take taxable value, per-year recorded values,
  the 3-year average, tax, arrears, interest, and total payable from the
  **"Land Tax Notice (Extracted)"** block in the user message when present —
  these are AI-extracted from the assessment notice, so state them with an
  "AI-extracted — confirm before relying on it" caveat rather than as bare
  fact. Only fall back to "UNCONFIRMED — obtain from assessment notice" for a
  figure that is genuinely absent from that block (no notice on file, or the
  notice didn't yield that field) — do not default to "UNCONFIRMED" when the
  data is actually present.

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

**Every non-`CONFIRMED` row's `impact` text must end with an explicit
verification instruction** naming the specific document or action that would
confirm it (e.g. "Must be confirmed by independent s10.7 certificate and/or
flood mapping evidence before lodgement."). Never leave an AI-detected/
unconfirmed row silent on what would verify it — a bare "NOT YET VERIFIED"
status with no path to resolution is not acceptable. That verification action
must match whatever is listed against the same item in Section 8
(`evidence_checklist`), consistent with the Section 4.2 / Section 8 agreement
rule above.

**Keep each `impact` cell to roughly 2–4 sentences**: a bolded severity lead-in
(`Major —` / `Negative —` / `Positive —` / `Pending —` / `No impact identified.`),
the core reasoning, and — if not `CONFIRMED` — the verification instruction above.
Don't re-argue the constraint's full implications here; the deeper argument belongs
in Section 6 (weaknesses) or Section 9 (narrative), not repeated at length in 4.2.

## Section 5 — Independent (CPV) Valuation Analysis
**`cpv.section_title` should be omitted whenever no independent CPV report is on
file yet** — the template falls back to a stable default heading. Only set a
custom `section_title` once a real CPV report exists, naming the valuer/firm
(e.g. "RAY WHITE VALUATIONS CPV REPORT — DETAILED ANALYSIS").
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
- Add a `cpv.extra_rows` entry stating the firm's own assessed value distinctly from the
  comparable range itself, e.g. `{label: "Firm's Assessed Value", value: <contended_value,
  formatted>, note: "Based on the comparable evidence in this report; independent CPV
  valuation will confirm or refine"}`. `comp_summary_row.ref` may still read
  `"CPV ADOPTED RANGE"` for the range itself — the extra row is what states a specific number.

## Section 6 — Weaknesses & Legal Grounds
6.1 tabulates each VG weakness with Evidence and the Objection Argument.
6.2 states the formal grounds. For the primary ground (value too high), state
`valuation.contended_value` explicitly — for example: "We assess the land
value at $540,000 as at 1 July 2025, based on the comparable evidence set out
in this report, subject to independent CPV confirmation." (substitute this
case's own contended value and actual valuation date; never carry the example
figures above into a real report). Standard grounds:
- **s.34(1)(a)** Valuation of Land Act 1916 — *valuation too high* (primary).
- **s.6A** — speculative/anticipated rezoning value is *impermissible*; value at
  HBU as at the relevant date.
- **Constraint oversight** — mass-appraisal benchmark ignores site-specific constraints.
- **s.34(1)(b)** — *factual error* (e.g. recorded area ≠ registered DP area).

**Voice for 6.1:** Write the `argument` column assertively — for example: "We
submit the VG erred by relying on comparable sales outside the subject's
market area. The comparable evidence demonstrates a materially lower rate is
supported locally. The correct rate is approximately $1,125/m², not $1,292/m²
as implied by the assessment." (substitute this case's own reasoning,
evidence, and rates — never carry the example figures above into a real
report).

## Section 7 — Financial Impact
One row per scenario (current VG, and each CPV-based value). Supply taxable value
and land tax per scenario; the strongest scenario gets `emph: true`. Follow with
a green "maximum/conservative saving" callout and a blue interest-arrears note.

## Section 8 — Evidence Checklist
Every item the objection package needs, with a status. The most urgent is
usually the valuer's confirmation letter aligning the CPV to the relevant
valuation date, and the VG Information Kit (the VG's own sales/benchmark).
Write status/action text as formal statements of what is required and by when
(e.g. "Required before lodgement — to be obtained from Randwick City Council"),
not as an internal reminder to the preparer (avoid "obtain immediately", "confirm
with X" phrased as a note-to-self) — the content is the same, only the register changes.

**Ground every status in the "Documents Already On File For This Case" list given in the
user message — never guess.** Mark an item `"AVAILABLE"` (or `"CONFIRMED IN CPV"` if it's
bundled inside an already-obtained CPV report rather than a standalone document) ONLY when a
matching document appears in that list; otherwise `"PENDING"` (add `"— URGENT"` if it blocks
lodgement) — never `"Not obtained"`, even for documents you would normally expect to exist by
this stage. This list is also the source of truth for Section 4.2's `constraints[].status` and
any other place a supporting document is referenced — it must never contradict what's stated
here (e.g. do not mark something `CONFIRMED` in 4.2 while listing its supporting document as
still `PENDING` in this checklist).

## Section 9 — Objection Narrative
Ready-to-paste prose for the VG objection form. Open with this case's own
full entity name, lot(s), and valuation date filled in directly — for
example: "We Bexhill Property Holdings Pty Ltd ATF Bexhill Family Trust
hereby object to the land value assessed by the Valuer General for Lot 12 DP
887744 as at 1 July 2025, on the following grounds:" (never carry this
example entity/lot/date into a real report — substitute the actual case's
own values). One paragraph per ground with a
`<strong>` lead-in. Use "We contend that…", "We submit that…", "The evidence
demonstrates…". Never hedge — this is a formal objection, not exploratory analysis.
Base only on confirmed facts established earlier in the report.

**Hard constraint — pure objection prose only.** `objection_narrative.intro` and every
entry in `objection_narrative.paragraphs` must contain *only* the objection argument
addressed to the Valuer General. Never include internal process commentary, a
verification-status label, a note about the deadline having lapsed, or any remark
addressed to the preparer (e.g. "NOTE FOR INTERNAL USE", "drafted for use upon
resolution of..."). If the objection window has lapsed, that status lives in the
Executive Summary and the Priority Action Plan (Section 10) — never here, no matter
what "confirmed facts" established earlier in the report include it.

## Section 10 — Priority Action Plan
Numbered actions with how-to, deadline, status. The pay-tax line must stress
that lodging an objection does **not** suspend payment — interest accrues.
Phrase `status` using the closed vocabulary (`"PENDING"`, add `"— URGENT"` for the
single most critical item; `"DUE"` for the payment line once its due date has
passed; `"TARGET"` for a dated action still on track; `"DONE"` once actually
completed) — never "Not yet actioned" or "Completed", which aren't recognised by
the report's color-coding (see "Auto-derived status colours" in `data_schema.md`).

## Section 11 — Disclaimer
This section — and only this section — carries the internal-tool/limitations
framing. State that this document does not itself constitute an independent
market valuation and is not a substitute for the CPV report; that the CPV report
is the primary evidence and must be attached before lodgement; that any
"internal reporting only" limitation on the CPV must be cleared before
submission; and sole-use/no-disclosure.
End with the payment reminder (red callout).