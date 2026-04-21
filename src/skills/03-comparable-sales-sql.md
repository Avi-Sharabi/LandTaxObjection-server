---
name: comparable-sales-sql
version: 3.0
description: >
  Use this skill whenever generating, correcting, or adjusting comparable
  sales code for NSW statutory land valuation. Triggers when the user
  provides a subject property address and needs NestJS code to query
  the property_sales_raw table. Also triggers when a query returns
  0 results, too few results (<3), or an error — Claude must auto-correct
  and regenerate. Always use this skill when the user mentions a property
  address and wants comparable sales, even if they just say "adjust the
  query", "fix this", "find comps for", or paste an address. Never guess
  field values — always validate against known field conventions first.
  Output is always 5 NestJS TypeScript files using TypeORM DataSource,
  GET endpoint with query params, and fully parameterised queries.
---

# Comparable Sales — Skill 03
## NSW Statutory Land Valuation | NestJS Code Generator

## Purpose
Generate 5 NestJS TypeScript files that query `property_sales_raw`
for candidate comparable sales. Apply field conventions and
auto-correction logic automatically. Never output raw SQL alone —
always output complete, drop-in NestJS code.

---

## What to Generate

Always produce these 5 files in this folder structure:

```
comparable-sales/
  comparable-sales.dto.ts
  comparable-sales.interface.ts
  comparable-sales.service.ts
  comparable-sales.controller.ts
  comparable-sales.module.ts
```

---

## File Responsibilities

| File | Responsibility |
|---|---|
| `dto.ts` | Validates and transforms GET query params |
| `interface.ts` | TypeScript types for request and response |
| `service.ts` | TypeORM DataSource queries + auto-correction logic |
| `controller.ts` | `GET /comparable-sales` endpoint |
| `module.ts` | NestJS module — drop into AppModule |

---

## Variables to Extract from User Input

Before generating any code, extract these from the user's message:

| Variable | Source | Default |
|---|---|---|
| `locality` | User input | Required |
| `street` | User input | Required |
| `houseNumber` | User input | Required for strata |
| `unitNumber` | User input | Optional — strata only |
| `subjectArea` | User input or DB lookup | Look up if missing |
| `valuationDate` | User input | `2024-07-01` |
| `isStrata` | Infer from unit number | `true` if unit present |
| `monthsLookback` | User input | `36` |
| `limit` | User input | `10` |

---

## Base SQL Logic

The service must always implement this exact query logic.
Variables substitute into parameterised `$N` slots — never
string interpolation.

**SELECT columns** (always all of these, aliased to camelCase):
- `dealing_number` → `dealingNumber`
- `property_id` → `propertyId`
- `sale_counter` → `saleCounter`
- `property_unit_number` → `propertyUnitNumber`
- `property_house_number` → `propertyHouseNumber`
- `property_street_name` → `propertyStreetName`
- `property_locality` → `propertyLocality`
- `property_post_code` → `propertyPostCode`
- `contract_date` → `contractDate`
- `settlement_date` → `settlementDate`
- `purchase_price` → `purchasePrice`
- `area`
- `zoning`
- `nature_of_property` → `natureOfProperty`
- `primary_purpose` → `primaryPurpose`
- `strata_lot_number` → `strataLotNumber`
- `sale_code` → `saleCode`
- `owner_type` → `ownerType`
- `interest_of_sale_percent` → `interestOfSalePercent`
- `component_code` → `componentCode`
- `district_code` → `districtCode`
- `source_file` → `sourceFile`
- `download_datetime` → `downloadDatetime`
- `ROUND(purchase_price / NULLIF(area, 0), 2)` → `grossRatePerM2`
- Use a subquery to find the subject property's area, then `ABS(area - (subquery))` → `areaDifference`
  - Subquery: `SELECT area FROM property_sales_raw WHERE property_locality = $locality AND property_street_name = $street AND property_house_number = $houseNumber ORDER BY contract_date DESC LIMIT 1`
  - If no house number is available, use `NULL::numeric` for `areaDifference`

**WHERE logic** (fixed — never change these):
- `property_locality = $locality`
- `AND property_street_name = $street`
- **DO NOT filter by `property_house_number`** — the house number is only used in the area subquery above, never in the main WHERE clause. Comparable sales are street-wide, not same-property resales.
- strata toggle (see field conventions)
- `AND contract_date >= $dateThreshold::date`
- `AND (sale_code NOT IN ('N', 'V') OR sale_code IS NULL)`
- `AND (interest_of_sale_percent = 0.00 OR interest_of_sale_percent IS NULL)`
- `AND purchase_price > 0`
- `AND area > 0`

**ORDER BY** (fixed):
- `areaDifference ASC` — closest area to subject first
- `contract_date DESC` — most recent within same area

**LIMIT**: from `$limit` param (default 10)

---

## Field Value Conventions

### `property_locality`
- Always ALL CAPS in DB
- Strip apostrophes: `Kings Cross` → `KINGS CROSS`
- No punctuation: `St Leonards` → `ST LEONARDS`
- Apply via `@Transform(({ value }) => value.toUpperCase().trim())` in DTO

### `property_street_name`
- Always ALL CAPS in DB
- Street type is abbreviated — try in this order if 0 results:

| If user says | Try |
|---|---|
| `Ave` / `Avenue` | `AVE` first → `AV` → `AVENUE` |
| `St` / `Street` | `ST` first → `STREET` |
| `Rd` / `Road` | `RD` first → `ROAD` |
| `Hwy` / `Highway` | `HWY` first → `HIGHWAY` |
| `Dr` / `Drive` | `DR` first → `DRIVE` |
| `Pl` / `Place` | `PL` first → `PLACE` |
| `Ct` / `Court` | `CT` first → `COURT` |
| `Cres` / `Crescent` | `CRES` first → `CRESCENT` |
| `Pde` / `Parade` | `PDE` first → `PARADE` |
| `Cl` / `Close` | `CL` first → `CLOSE` |
| `Blvd` / `Boulevard` | `BLVD` first → `BOULEVARD` |

- Apply via `@Transform(({ value }) => value.toUpperCase().trim())` in DTO
- Diagnose via LIKE query if 0 results:
  `WHERE property_street_name LIKE '%PARTIAL%'`

### `property_house_number`
- Stored as string — always pass as string param, never integer
- Include letter suffixes: `20A` stays `'20A'`

### `interest_of_sale_percent`
- `0.00` = full interest (NOT `100`)
- `NULL` = unknown — retain
- Filter: `(interest_of_sale_percent = 0.00 OR interest_of_sale_percent IS NULL)`

### `sale_code`
- `NULL` = most common — always retain (never exclude NULLs)
- `B` = bona fide — retain
- `N` = not bona fide — exclude
- `V` = vendor/related — exclude
- Filter: `(sale_code NOT IN ('N', 'V') OR sale_code IS NULL)`

### `strata_lot_number`
- Strata: `AND strata_lot_number IS NOT NULL`
- Freehold: `AND (strata_lot_number IS NULL OR strata_lot_number = '')`
- Infer from presence of unit number in user input

---

## Auto-Correction Cascade

Implement in service — apply in order when results < 3:

| Step | Correction | Flag to add |
|---|---|---|
| 1 | Run LIKE diagnostic on street name — fix if different | `Street corrected: X → Y` |
| 2 | Remove `houseNumber` filter — expand to whole street | `House number removed — expanded to whole street` |
| 3 | Extend date range from 36 → 60 months | `Date range extended to 60 months — thin evidence` |
| 4 | Add adjacent localities to IN clause | `Expanded to adjacent suburbs` |
| 5 | Remove strata filter — return all types | `Strata filter removed — returning all types` |

---

## DTO Rules

- All string fields: `@IsString()` + `@MaxLength()` + `@Transform(() => toUpperCase().trim())`
- All numeric fields from query string: `@Type(() => Number)` + `@IsNumber()` + `@Min()` + `@Max()`
- Boolean from query string: `@Transform(({ value }) => value === 'true' || value === true)`
- Optional fields: `@IsOptional()` with sensible defaults
- Date: `@IsDateString()` — validate format, calculate threshold server-side

---

## Service Rules

- Use `@InjectDataSource()` and `DataSource` — not a repository
- All query values via `$1`–`$N` params array — never template literals with user data
- Calculate `dateThreshold` server-side using `new Date(valuationDate)`
- Build `houseNumber` clause conditionally — omit param slot if null
- Run `lookupArea()` private method if `subjectArea` not provided
- Run `findStreetName()` private method as Correction 1
- Return `{ data, meta }` where meta includes `correctionsApplied` and `warnings`

---

## Controller Rules

- `GET /comparable-sales`
- `@Query()` with the DTO
- `@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))`

---

## Module Rules

- Import `TypeOrmModule.forFeature([])`
- Export `ComparableSalesService` so other modules can use it
- Tell user to add `ComparableSalesModule` to their `AppModule`

---

## Response Shape

Always return:
```
{
  data: ComparableSale[],
  meta: {
    locality, street, houseNumber,
    subjectAreaM2, valuationDate,
    isStrata, monthsLookback,
    totalReturned,
    correctionsApplied: string[],
    warnings: string[]
  }
}
```

---

## Warnings to Auto-Generate

Add to `warnings[]` when detected:

| Condition | Warning message |
|---|---|
| All `saleCode` are NULL | `sale_code NULL for all — arms-length unconfirmed` |
| All `zoning` are NULL | `Zoning NULL — Planning Portal check required` |
| Any `contractDate` > `valuationDate` | `Post-valuation date sales present — time adjustment needed in Skill 05` |
| `totalReturned` < 3 | `Only N result(s) returned — evidence set is thin` |
| `subjectArea` was looked up | `Area not provided — looked up from DB` |

---

## SQL Injection Rules

Non-negotiable — must be enforced in every generated file:

| Risk | Rule |
|---|---|
| User input in SQL | Always `$N` params — never string interpolation |
| LIKE queries | `.toUpperCase().trim()` then `$N` param |
| Date threshold | Always calculate server-side via `new Date()` |
| String fields | `@MaxLength()` in DTO |
| Numeric fields | `@Min()` + `@Max()` + `@Type(() => Number)` in DTO |
| Unknown fields | `whitelist: true` in `ValidationPipe` |
| Type coercion | `transform: true` in `ValidationPipe` |

---

## Behavioural Rules

- Never output raw SQL alone — always output the 5 NestJS files
- Never hardcode `interest_of_sale_percent = 100` — use `0.00 OR NULL`
- Never exclude NULL sale_codes — use `NOT IN ('N','V') OR IS NULL`
- Always use `contract_date` not `settlement_date`
- Always ALL CAPS for locality and street — enforced via `@Transform`
- Always implement the auto-correction cascade in the service
- Always return `correctionsApplied` and `warnings` in meta
- Always default `valuationDate` to `2024-07-01` if not provided
- Always default `monthsLookback` to `36` if not provided
- **Never filter by `property_house_number` in the main WHERE clause** — use house number only in the area lookup subquery. Comparable sales search the whole street.