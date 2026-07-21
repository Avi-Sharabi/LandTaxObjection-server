---
name: evidence-score
description: >
  Computes a deterministic 0–100 evidence_strength_score and
  evidence_strength_rationale using only the structured Supporting Evidence
  Issues, Comparable Sales, and Objection Grounds supplied to the
  valuation-report skill. This skill is never invoked independently and only
  augments the valuation-report JSON output.
---

# Evidence Score — Deterministic Scoring Rubric

This skill computes a single **0–100 integer** representing the overall
strength of evidence supporting a NSW land tax objection.

The score is calculated **only** from structured data already produced or
supplied to the `valuation-report` skill:

- Supporting Evidence Issues (ticked)
- Comparable Sales (AI-Analysed)
- Objection Grounds (ticked)

The calculation is **purely arithmetic** and **must never** be influenced by
report narrative, valuation outcome, recommendation, writing style, or any
other section of the report.

The score and rationale are returned as top-level JSON fields alongside the
normal `valuation-report` output. They are **never rendered** inside the
generated report or PDF.

---

# Definitions

## Ticked Item

A "ticked" item is one that has been explicitly selected in the structured
input (for example `selected = true`, `status = "TICKED"`, or the equivalent
field defined by the valuation-report schema).

Unticked items must be ignored completely.

---

## Confidence Levels

Confidence values are interpreted as:

| Confidence | Counts As |
|------------|-----------|
| HIGH | HIGH |
| MEDIUM | MEDIUM |
| LOW | 0 |
| MANUAL_REVIEW_REQUIRED | 0 |
| UNKNOWN | 0 |
| null / missing | 0 |

---

## Verification Status

The following values count as **verified**:

- EVIDENCE_OBTAINED
- CLIENT_CONFIRMED

All other values—including:

- AI_DETECTED_UNVERIFIED
- UNKNOWN
- null
- missing

count as **not verified**.

---

# Component A — Supporting Evidence Quality (0–40 points)

Let:

- **T** = total number of ticked Supporting Evidence Issues.

If:

```
T = 0
```

then

```
Component A = 0
```

Otherwise:

```
H = number of HIGH confidence issues

M = number of MEDIUM confidence issues

confidence_ratio = (H + (0.5 × M)) / T
```

Next calculate:

```
V = number of verified issues
```

where verified means:

- EVIDENCE_OBTAINED
- CLIENT_CONFIRMED

Then

```
verification_ratio = V / T
```

Finally

```
Component A =
round(20 × confidence_ratio)
+
round(20 × verification_ratio)
```

Maximum:

```
40 points
```

---

# Component B — Comparable Sales Strength (0–30 points)

Let:

```
C = number of comparable sales included in the final
AI-Analysed Comparable Sales table.
```

Only comparable sales included in the final table are counted.

Discarded, rejected, or filtered-out comparables must **not** be counted.

Scoring:

| Comparable Sales | Score |
|------------------|------:|
| 0 | 0 |
| 1–2 | 10 |
| 3–4 | 20 |
| 5 or more | 30 |

---

# Component C — Objection Grounds Strength (0–30 points)

Let

```
G = total number of ticked objection grounds
```

If

```
G = 0
```

then

```
Component C = 0
```

Otherwise:

```
breadth =
min(G,3)
/ 3
```

Next calculate

```
GV =
number of verified objection grounds
```

where verified means:

- EVIDENCE_OBTAINED
- CLIENT_CONFIRMED

Then

```
strength = GV / G
```

Finally

```
Component C =
round(15 × breadth)
+
round(15 × strength)
```

Maximum:

```
30 points
```

---

# Total Score

```
Total =
Component A
+
Component B
+
Component C
```

Clamp the result to:

```
0 ≤ Total ≤ 100
```

The final value must always be an **integer**.

---

# Output

Return the following top-level JSON fields alongside the normal
`valuation-report` output.

```json
{
  "evidence_strength_score": 78,
  "evidence_strength_rationale": "Supporting evidence: 3/4 HIGH or MEDIUM confidence (2 HIGH, 1 MEDIUM); 2/4 verified; 6 comparable sales; 2/3 objection grounds verified."
}
```

If none of the three structured inputs are present:

- no Supporting Evidence Issues
- no Comparable Sales
- no Objection Grounds

then return

```json
{
  "evidence_strength_score": 0,
  "evidence_strength_rationale": "No supporting evidence, comparable sales, or objection grounds were provided."
}
```

Never return:

- null
- UNCONFIRMED
- floating-point numbers

---

# Rounding

Use standard mathematical rounding.

Examples:

```
10.4 → 10

10.5 → 11

10.6 → 11
```

Do not use banker's rounding.

---

# Validation

Before returning the output, ensure:

- Component A is between **0 and 40**
- Component B is between **0 and 30**
- Component C is between **0 and 30**
- Total equals the sum of Components A, B, and C
- Total is clamped to **0–100**
- evidence_strength_score is an integer
- evidence_strength_rationale is exactly one sentence

---

# Key Rules

- Use **only** the structured inputs supplied to the `valuation-report` skill.
- Do **not** infer or estimate missing values.
- Do **not** inspect report narrative or recommendations.
- Do **not** adjust the score based on writing quality, valuation outcome, assessor opinion, or success likelihood.
- The calculation must be deterministic. Identical inputs must always produce identical outputs.
- This skill never runs independently; it only augments the `valuation-report` JSON output.
- The score and rationale must never appear inside the generated valuation report or PDF.