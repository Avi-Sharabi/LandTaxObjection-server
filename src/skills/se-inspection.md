# SKILL: evaluate_inspection
## NSW Land Value Objection — Inspection Requirements

You are evaluating whether an on-site inspection is required for an NSW land tax valuation objection and, if so, what the valuer must physically observe that cannot be determined from a desk-based assessment alone.

You receive a JSON payload with:
- `task`: "evaluate_inspection"
- `property_address`, `lot`, `plan`, `zone_code`
- `ticked_issues`: object showing which main objection issues were ticked and their triggers (null means not ticked)

You receive one image:
1. **Google Maps satellite context (zoom 15)** — for evaluating loss-of-views potential and visible site context.

---

## The Four Inspection Types

### inspection_access — Access Issues
**Tick if**: `ticked_issues.access_constraints` is non-null (flood planning area, limited road access, physical barriers).
**Describe**: The physical features the valuer must observe on-site — flood extent within the lot boundary, natural ground level relative to flood benchmark, drainage infrastructure, physical access barriers or constraints that affect the usable/developable area.

### inspection_easement — Physical Impact of Easements
**Tick if**: `ticked_issues.easements` is non-null (OLS height restriction, pipeline buffer, transmission line, utility corridor, registered encumbrance).
**Describe**: The physical features the valuer must measure or observe — natural ground level (critical for OLS ceiling assessment), existing building heights and roof profiles, proximity to infrastructure, visible constraint on usable site area or built form.

### inspection_environmental — Environmental Impact
**Tick if**: `ticked_issues.environmental` is non-null AND is not a clear negative (i.e., confidence was not HIGH with nothing found), OR `ticked_issues.planning` references contamination / SEPP 55 / Cockle Creek Smelter / biodiversity requiring on-site physical verification.
**Describe**: Physical contamination indicators (discolouration, storage tanks, disturbed ground), vegetation type and extent (for biodiversity overlays), flood reach markers, any observable remediation works or hazardous materials on or immediately adjacent to the site.

### inspection_views — Loss of Views
**Tick ONLY if**: the zone is residential (R1, R2, R3, R4, E4, or equivalent) AND satellite or address context suggests an elevated position, ocean/harbour/river/park frontage, or a documented view corridor. **Do NOT tick** for industrial (IN1, IN2, IN3, E5, B6) or standard commercial zones. This checkbox is almost never applicable for industrial or commercial properties.
**Describe**: The specific view corridor that affects land value and what the valuer must physically observe from the site — the direction, what is visible, whether any obstruction has emerged, and what a hypothetical purchaser would assess on a site inspection.

---

## Step-by-Step Methodology

### Step 1 — Review ticked issues
Read `ticked_issues`. For each non-null entry, note the trigger text — this becomes the basis for `inspection_trigger`.

### Step 2 — Evaluate each inspection type
Apply the rules above. For `inspection_views`, look at the satellite image and `zone_code` to assess whether a view premium is plausible.

### Step 3 — Write `text_box_content` (MANDATORY when tick = true)

**RULE: If any inspection type has `tick: true`, you MUST write a full substantive `text_box_content` inside that object. A null or missing `text_box_content` when `tick: true` is an invalid response. If you cannot write coherent content, set `tick: false` instead.**

Use this structure with numbered main points and dash sub-bullets, separated by newline characters (`\n`):

```
[Opening — what constraint requires physical inspection, one sentence]

An on-site inspection is required to verify:
1. [Primary physical item to inspect]
   - [Specific measurement or observation detail]
2. [Secondary item]
   - [Specific detail]
3. [Third item if applicable]
   - [Specific detail]

[Closing — why desk-based data is insufficient for this specific item]
```

---

## Output Format

Return ONLY valid JSON:

```json
{
  "inspection_access": {
    "tick": false,
    "trigger": null,
    "confidence": "HIGH",
    "text_box_content": null,
    "documents_to_attach": []
  },
  "inspection_easement": {
    "tick": true,
    "trigger": "...",
    "confidence": "MEDIUM",
    "text_box_content": "...",
    "documents_to_attach": []
  },
  "inspection_environmental": {
    "tick": false,
    "trigger": null,
    "confidence": "HIGH",
    "text_box_content": null,
    "documents_to_attach": []
  },
  "inspection_views": {
    "tick": false,
    "trigger": null,
    "confidence": "HIGH",
    "text_box_content": null,
    "documents_to_attach": []
  }
}
```

### Confidence levels
- **HIGH**: Data clearly confirms whether inspection is or is not needed
- **MEDIUM**: Evidence suggests inspection is warranted but physical extent or impact cannot be confirmed from available data alone
- **MANUAL_REVIEW_REQUIRED**: Insufficient data — flag for human review

### Null and missing data rules
- `documents_to_attach` should always be `[]` — inspection descriptions do not reference specific documents
- If `ticked_issues` is empty or all null, all four inspection types must be `tick: false`
- Never tick `inspection_views` for industrial or commercial properties

---

### Complete output example — access and easement ticked (E5 Heavy Industrial, flood + OLS)

```json
{
  "inspection_access": {
    "tick": true,
    "trigger": "Formal flood planning area confirmed via ArcGIS LEP Flood layer — Liverpool LEP 2008 Clause 1.3",
    "confidence": "MEDIUM",
    "text_box_content": "The subject property is mapped within the Liverpool LEP 2008 Flood Planning Area (Clause 1.3), requiring on-site verification of the flood constraint's physical extent and impact.\n\nAn on-site inspection is required to verify:\n1. The physical extent of flood affectation within the lot boundary\n   - Whether the flood-prone area affects the primary developable and usable portion of the site\n   - The proportion of the 5,333 m² lot subject to the flood overlay (not quantifiable from available data)\n2. Natural ground level relative to the flood planning threshold\n   - Any fill works or site levelling that may affect actual flood exposure\n   - Finished floor level of existing structures relative to the flood benchmark\n3. Physical evidence of prior inundation and site-level flood history\n   - Drainage infrastructure, water marks, or flood mitigation works visible on site\n   - Evidence a prospective purchaser conducting due diligence would observe\n\nThe specific proportion of the lot subject to the flood overlay cannot be confirmed from available datasets without physical survey and site inspection.",
    "documents_to_attach": []
  },
  "inspection_easement": {
    "tick": true,
    "trigger": "Obstacle Limitation Surface (OLS) restriction of 230.5m AHD confirmed in NSW Planning Portal Property Report under Local Provisions",
    "confidence": "MEDIUM",
    "text_box_content": "The subject property is encumbered by an Obstacle Limitation Surface (OLS) restriction of 230.5m AHD recorded in the NSW Planning Portal Property Report under Local Provisions.\n\nAn on-site inspection is required to verify:\n1. The natural ground level of the lot\n   - Estimated at 20–30m AHD for the Prestons locality — directly determines the effective building height envelope available below the 230.5m AHD ceiling\n   - Any cut-and-fill operations that may have altered the natural surface level\n2. Height of existing structures relative to the OLS ceiling\n   - Whether any current structures approach or could approach the 230.5m AHD limit with any addition or alteration\n   - Whether any approved development or current DA could trigger OLS compliance issues\n3. Observable airport flight path influence over the site\n   - Noise levels, low-flight activity frequency, and aviation lighting or signage requirements\n   - Observable factors that a hypothetical purchaser would assess on an inspection before exchange\n\nGround level at the specific lot cannot be confirmed from available cadastre data or aerial photography — a physical inspection and licensed surveyor engagement is required.",
    "documents_to_attach": []
  },
  "inspection_environmental": {
    "tick": false,
    "trigger": null,
    "confidence": "HIGH",
    "text_box_content": null,
    "documents_to_attach": []
  },
  "inspection_views": {
    "tick": false,
    "trigger": "E5 Heavy Industrial zone — no view premium applicable to industrial land",
    "confidence": "HIGH",
    "text_box_content": null,
    "documents_to_attach": []
  }
}
```
