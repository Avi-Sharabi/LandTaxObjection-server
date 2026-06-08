# Evidence Source Navigation Guide (Puppeteer)

*Reusable navigation steps for NSW land tax objection evidence collection.*
*Steps use placeholders — fill from property input before running. Example values shown from 1020 MELIA CT CASTLE HILL NSW.*

---

## Placeholders

| Placeholder | Meaning | Example |
|---|---|---|
| `[PID]` | Valuer General Property ID | 3701422 |
| `[ADDRESS]` | Full property address | 1020 MELIA CT CASTLE HILL NSW |
| `[TRUSTEE_NAME]` | Trustee company name | CASTLE HILL GLEN PTY LTD |
| `[TRUST_NAME]` | Full trust name | CASTLE HILL GLEN UNIT TRUST |
| `[LOT]` | Lot number | 1 |
| `[DP]` | Deposited plan number | 576773 |
| `[ENTITY_SEARCH]` | Short search term for entity | CASTLE HILL GLEN |

---

## Access Key
- ✅ Puppeteer + stealth — all sources automatable with puppeteer-extra-plugin-stealth

---

---

## GROUND 9A — Entity Identity

---

## ABR Lookup
**URL:** https://www.abr.business.gov.au/Search/Advanced
**Access:** ✅ Puppeteer + stealth
**Ground:** 7, 9A
**Purpose:** Confirm trust name, ABN, entity type (Unit Trust), and active status — proves correct entity identity (Ground 7) and confirms unit trust classification (Ground 9A)

### Steps
1. Wait for the page to fully load — confirm the name search field is visible
   → waitForSelector(`input#SearchParameters_SearchText`)
2. Fill the "Name" field with [TRUST_NAME]
   → `input#SearchParameters_SearchText`
3. Click the Search button
   → `input[name="SubmitButton"]`
4. Click the ABN link in the search results (ABN is the clickable link in the results table)
   → `a[href*="/ABN/View"]` (first match in results table)
5. Screenshot the ABN detail page — save as ground-7-9a-abr-entity-[date].png

### Expected output
ABN number, entity type "Unit Trust", entity name matching notice, ABN status Active

### Learned steps
1. type "input#SearchParameters_SearchText" → [TRUST_NAME]
2. click "input[name="SubmitButton"]"
3. wait
4. click "a[href*="/ABN/View"]"
5. screenshot → ground-7-9a-abr-entity
6. done

## ABR Company Lookup
**URL:** https://www.abr.business.gov.au/Search/Advanced
**Access:** ✅ Puppeteer + stealth
**Ground:** 7
**Purpose:** Confirm trustee company name, ACN, and active status — proves CASTLE HILL GLEN PTY LTD is the correct person on the notice (Ground 7)

### Steps
1. Wait for the page to fully load — confirm the name search field is visible
   → waitForSelector(`input#SearchParameters_SearchText`)
2. Fill the "Name" field with [TRUSTEE_NAME]
   → `input#SearchParameters_SearchText`
3. Click the Search button
   → `input[name="SubmitButton"]`
4. Click the ACN/ABN link in the search results for the matching company
   → `a[href*="/ABN/View"]` (first match in results table)
5. Screenshot the company detail page — save as ground-7-abr-company-[date].png

### Expected output
Company name matching the notice exactly, ACN, ABN, entity type "Australian Private Company", status Active

---

### Learned steps
1. type "input#SearchParameters_SearchText" → CASTLE HILL GLEN PTY LTD
2. click "input[name="SubmitButton"]"
3. click "a[href*="/ABN/View"]"
4. screenshot → ground-7-abr-company
5. done

## ASIC Company Search
**URL:** https://connectonline.asic.gov.au/RegistrySearch/faces/landing/SearchRegisters.jspx
**Access:** ✅ Puppeteer + stealth
**Ground:** 7, 9A
**Purpose:** Confirm ACN, registered company name, and current status of trustee company

### Steps
1. Wait for the page to fully load — confirm the search type dropdown and company name input ("For:") are visible
2. Ensure "Organisation & Business Names" is selected in the search type dropdown
   → Click the dropdown and select "Organisation & Business Names" if not already selected
3. Fill the company name field with [TRUSTEE_NAME]  ← e.g. "CASTLE HILL GLEN PTY LTD"
   → The text input next to the search type dropdown (labelled "For:")
4. Click the "Go" button to submit the search
5. Wait for results to load — look for a results list or table with matching entity names
6. Click on the matching company result for [TRUSTEE_NAME]
   → `a` or row containing [TRUSTEE_NAME] text in results list
7. Screenshot the company detail page — save as ground-7-asic-company-[date].png

### Expected output
ACN, registered name, company type, registration date, current status (Registered/Deregistered)

### Difficulty log
- 2026-06-04: Permanently blocked — ASIC Connect Online search form is not accessible to the automation agent. The form renders inside an Oracle ADF iframe that does not appear in the accessibility tree. Use ABR Company Lookup instead for Ground 7 entity verification.

## ASIC Published Notices
**URL:** https://connectonline.asic.gov.au/RegistrySearch/faces/landing/SearchRegisters.jspx
**Access:** ✅ Puppeteer + stealth
**Ground:** 7, 9A
**Purpose:** Confirm [TRUSTEE_NAME] is NOT in external administration or liquidation — screenshot the company status field from ASIC registry

### Steps
1. Wait for the page to fully load — confirm the search type dropdown and company name input ("For:") are visible
2. Ensure "Organisation & Business Names" is selected in the search type dropdown
3. Fill the company name field with [TRUSTEE_NAME]  ← e.g. "CASTLE HILL GLEN PTY LTD"
   → The text input next to the search type dropdown (labelled "For:")
4. Click the "Go" button
5. Wait for results — click on the matching company result for [TRUSTEE_NAME]
6. On the company detail page, locate the "Status" field — it should show "Registered" (not "External Administration")
7. Screenshot the company detail focusing on the Status field — save as ground-7-asic-status-[date].png

### Expected output
Company status shows "Registered" — confirms [TRUSTEE_NAME] is NOT in liquidation or external administration

### Difficulty log
- 2026-06-04: Permanently blocked — ASIC Connect Online search form is not accessible to the automation agent. The form renders inside an Oracle ADF iframe that does not appear in the accessibility tree. Company status is now confirmed via ABR Company Lookup instead.

## Super Fund Lookup
**URL:** https://superfundlookup.gov.au/Search/Advanced
**Access:** ✅ Puppeteer + stealth
**Ground:** 9A
**Purpose:** Confirm [TRUST_NAME] is NOT a registered superannuation fund — rules out LTMA s3A SMSF exception

### Steps
1. Wait for the page to fully load — confirm the fund name/ABN search field and state dropdown are visible
2. Fill the name search field with [ENTITY_SEARCH]  ← e.g. "CASTLE HILL GLEN"
   → `input#SearchParameters_SearchText`
3. Click Search
   → `input[name="SubmitButton"]`
4. Wait for results
   → waitForSelector(`table, .search-results, #content`)
5. Screenshot the results page — save as ground-9-superfund-[date].png

### Expected output
Zero results or no matching superannuation fund — confirms trust is not an SMSF

### Learned steps
1. wait
2. type "input#SearchParameters_SearchText" → CASTLE HILL GLEN
3. click "input[name="SubmitButton"]"
4. screenshot → ground-9-superfund
5. done

## ACNC Charity Register
**URL:** https://www.acnc.gov.au/charity/charities
**Access:** ✅ Puppeteer + stealth
**Ground:** 9A
**Purpose:** Confirm [TRUST_NAME] is NOT a registered charity — rules out LTMA s3A charitable trust exception

### Steps
1. Wait for the page to fully load — confirm the charity name/ABN search field is visible
   (URL is /charity/charities — the register search form is on this page)
2. Wait for search form to load
   → waitForSelector(`input[placeholder="Search charity name or ABN"]`)
3. Fill the charity name/ABN search field with [ENTITY_SEARCH]  ← e.g. "CASTLE HILL GLEN"
   → `input[placeholder="Search charity name or ABN"]`
4. Click Search
   → `button.btn-success[type="submit"]`
5. Wait for results to load
   → waitForSelector(`.search-result, .charity-result, #results`)
6. Screenshot results — save as ground-9-acnc-[date].png

### Expected output
Zero results — confirms entity is not a registered charity

---

---

### Learned steps
1. type "input[placeholder="Search charity name or ABN"]" → CASTLE HILL GLEN
2. click "button.btn-success[type="submit"]"
3. wait
4. screenshot → ground-9-acnc
5. done

## GROUND 9B — Revenue NSW Published Position

---

## Revenue NSW — Trusts Page
**URL:** https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/land-tax/understanding-land-tax/types-of-landowners/trusts
**Access:** ✅ Puppeteer + stealth
**Ground:** 9B
**Purpose:** Screenshot Revenue NSW's own 4-part fixed trust test — use their published words as evidence

### Steps
1. Wait for the page to fully load — confirm the main article content about trust types is visible
   → waitForSelector(`main, .main, article`)
2. Full-page screenshot — save as ground-9-revenue-trusts-[date].png

### Expected output
Revenue NSW published criteria for fixed trust: (1) presently entitled to all income after expenses; (2) presently entitled to capital, can require winding up; (3) entitlements cannot be removed/restricted by any discretion; (4) unit trust specific — only one class of units, proportion of capital on winding up = proportion of income

### Learned steps
1. screenshot → ground-9-revenue-trusts
2. done

## Revenue NSW — Types of Landowners
**URL:** https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/land-tax/understanding-land-tax/types-of-landowners
**Access:** ✅ Puppeteer + stealth
**Ground:** 9B
**Purpose:** Screenshot showing Revenue NSW recognises distinct landowner categories including Trusts

### Steps
1. Wait for the page to fully load — confirm the "Types of landowners" content with category links is visible
   → waitForSelector(`main, .main, article`)
2. Full-page screenshot — save as ground-9-revenue-landowners-[date].png

### Expected output
Five landowner types listed with Trusts as a distinct category linking to trust-specific rules

### Learned steps
1. screenshot → ground-9-revenue-landowners
2. done

### Difficulty log
- 2026-06-05: Failed at step 1 — Claude API error: Connection error.

## Revenue NSW — Rulings Library
**URL:** https://www.revenue.nsw.gov.au/help-centre/resources-library/rulings
**Access:** ✅ Puppeteer (content JS-rendered — screenshot what loads)
**Ground:** 9B
**Purpose:** Capture any published ruling on unit trust / special trust classification

### Steps
1. Wait 3 seconds for JS-rendered content to load — confirm the rulings list or page content is visible
   → waitForSelector(`main, .main, article`)
2. If a filter or category selector is visible, filter by "Land tax"
3. Screenshot the full page — save as ground-9-revenue-rulings-[date].png

### Expected output
List of Revenue NSW rulings — look for any ruling on trust classification or special trust definition

---

---

### Learned steps
1. screenshot → ground-9-revenue-rulings
2. scroll
3. click "https://www.revenue.nsw.gov.au/help-centre/resources-library/rulings/land-tax-rulings/lt-069"
4. click "link[name='Land tax ruling LT 069'], a[href*='lt-069'], a[href*='LT-069'], a[href*='LT069']"
5. click "link[name='Land tax rulings'], a[href*='land-tax-rulings']"
6. screenshot → ground-9-revenue-rulings-page
7. click "link[name='Land Tax']"
8. click "link[name='online services']"
9. wait
10. click "a[href*='rulings/land-tax'], a[href*='land-tax-rulings']"
11. click "a[href*='rulings']"
12. done

### Difficulty log
- 2026-06-06: Failed at step 15 — Max iterations reached without completing task

## GROUND 9C — Legislation

---

## Federal Register — Corporations Act 2001
**URL:** http://www.austlii.edu.au/au/legis/cth/consol_act/ca2001172/s9.html
**Access:** ✅ Puppeteer + stealth
**Ground:** 9C
**Purpose:** Screenshot definition of "unit trust scheme" in s9 — LTMA s3A explicitly carves this out from "special trust"

### Steps
1. Wait for the AustLII page to load — confirm the section heading and statutory text are visible
   → waitForSelector(`#content, .body-text, td, h1`)
2. Screenshot the full page — save as ground-9-corps-act-s9-[date].png

### Expected output
Corporations Act 2001 s9 definition of "unit trust scheme" — the carve-out that excludes it from LTMA's special trust definition

### Learned steps
1. screenshot → ground-9-corps-act-s9
2. scroll
3. click "a[href*='unit_trust_scheme'], a[name='unit_trust_scheme']"
4. click "a[href='https://www.austlii.edu.au/cgi-bin/viewdoc/au/legis/cth/consol_act/ca2001172/s9.html#unit_trust_scheme']"
5. screenshot → ground-9-corps-act-s9-unit-trust
6. click "a[href='https://www.austlii.edu.au/cgi-bin/viewdoc/au/legis/cth/consol_act/ca2001172/s9.html']"
7. click "a[href*='ca2001172/s9.html']"
8. wait
9. scroll
10. screenshot → ground-9-corps-act-s9-unit-trust
11. wait
12. screenshot → ground-9-corps-act-s9-unit-trust
13. wait
14. screenshot → ground-9-corps-act-s9-unit-trust-scheme
15. done

## Federal Register — ITAA 1997
**URL:** https://www.legislation.gov.au/C2004A05138/latest/text
**Access:** ✅ Puppeteer + stealth
**Ground:** 9C
**Purpose:** Screenshot ITAA 1997 landing page — establishes the Act and s97 "presently entitled" concept that Revenue NSW mirrors in its fixed trust test

### Steps
1. Wait 5000ms for the legislation.gov.au SPA to load
2. Screenshot the page showing the Act title and text tab — save as ground-9-itaa-s97-[date].png

### Expected output
legislation.gov.au page for Income Tax Assessment Act 1997 — confirms the Act exists and contains the "presently entitled" concept

### Learned steps
1. screenshot → ground-9-itaa-s97
2. done

## NSW Legislation — LTMA
**URL:** https://www.legislation.nsw.gov.au/view/html/inforce/current/act-1956-026
**Access:** ✅ Puppeteer + stealth
**Ground:** 9C
**Purpose:** Official NSW legislative text of s3A (special trust definition) and s10B (special trust rate)

### Steps
1. Wait for the page to fully load — confirm the Act text content with section headings is visible
   → waitForSelector(`article, .act-content, section[id], #content`)
2. Use page.evaluate with window.find to locate s3A
   → `page.evaluate(() => window.find("3A"))`
3. Scroll to s3A — definition of "special trust" — verify the section text is visible
4. Screenshot the full page showing s3A and surrounding provisions — save as ground-9-ltma-[date].png

### Expected output
Statutory text of LTMA s3A (what IS a special trust) and s10B (the rate that applies)

---

### Learned steps
1. click "a[href*='sec.3A']"
2. wait
3. extract → Navigating directly to s3A via URL fragment
4. click "a[href*='sec.3A']"
5. screenshot → ground-9-ltma-sec3A
6. done

## AustLII — LTMA s3A
**URL:** http://www.austlii.edu.au/au/legis/nsw/consol_act/ltma1956173/s3a.html
**Access:** ✅ Puppeteer + stealth
**Ground:** 9C
**Purpose:** Stable AustLII citation URL for LTMA s3A with hyperlinked cross-references

### Steps
1. Wait for the section content to load — confirm the LTMA s3A text is visible
   → waitForSelector(`#content, .body-text, td.cases`)
2. Screenshot the full section text — save as ground-9-austlii-ltma-[date].png

### Expected output
LTMA s3A in AustLII format with hyperlinked cross-references and stable citation URL

---

---

### Learned steps
1. screenshot → ground-9-austlii-ltma
2. extract → https://www.austlii.edu.au/cgi-bin/viewdoc/au/legis/nsw/consol_act/ltma1956173/s3a.html
3. done

## GROUND 9D — Case Law

---

## NSW Caselaw
**URL:** https://www.caselaw.nsw.gov.au/search/advanced?catchwords=special+trust+unit+trust&tribunals=54a634063004de94513d8289&courts=54a634063004de94513d8286&courts=54a634063004de94513d827f
**Access:** ✅ Puppeteer + stealth
**Ground:** 9D
**Purpose:** Find NCAT and Land and Environment Court decisions on unit trust / special trust classification

### Steps
1. Wait 3000ms for search results to load — the URL contains all search parameters so results appear on load
2. Screenshot the results list — save as ground-9-caselaw-[date].png

### Expected output
Decisions from NCAT and LEC mentioning "special trust" and "unit trust" — any holding that a unit trust is not a special trust is directly on point

### Difficulty log
- 2026-06-04: Failed at step 15 — Max iterations reached without completing task

## AustLII — NCAT Administrative Division
**URL:** http://www.austlii.edu.au/au/cases/nsw/NSWCATAD/
**Access:** ✅ Puppeteer + stealth
**Ground:** 9D
**Purpose:** NCAT Administrative Division decisions — search for unit trust / special trust land tax

### Steps
1. Wait for the page to fully load — confirm the search field and database scope selector are visible
2. Ensure "Search this database only" scope is selected
   → `input#database-this` (name="mask_path") — select this radio button
3. Fill the AustLII search field with "special trust unit trust land tax"
   → `input#search-box` (name="query", placeholder="Search this database only")
4. Click Search
   → `input[type="submit"]` (immediately after the search box)
5. Wait for results to load
6. Screenshot relevant results — save as ground-9-austlii-ncat-[date].png

### Expected output
NCAT decisions on special trust or unit trust classification for NSW land tax

---

### Difficulty log
- 2026-06-04: Failed at step 10 — AustLII search results page is blocked by a Cloudflare bot verification challenge ('Just a moment...') that cannot be resolved programmatically. The search URL https://www.austlii.edu.au/cgi-bin/sinosrch.cgi?meta=&mask_path=au%2Fcases%2Fnsw%2FNSWCATAD&method=auto&query=special+trust+unit+trust+land+tax was reached but the response is a persistent security wall preventing access to NCAT search results for 'special trust unit trust land tax'.

## AustLII — NSW Supreme Court
**URL:** http://www.austlii.edu.au/au/cases/nsw/NSWSC/
**Access:** ✅ Puppeteer + stealth
**Ground:** 9D
**Purpose:** NSW Supreme Court Equity Division — trust law decisions on "unit trust fixed trust presently entitled"

### Steps
1. Wait for the page to fully load — confirm the search field and database scope selector are visible
2. Ensure "Search this database only" scope is selected
   → `input#database-this` (name="mask_path")
3. Fill the AustLII search field with "unit trust fixed trust presently entitled"
   → `input#search-box` (name="query", placeholder="Search this database only")
4. Click Search
   → `input[type="submit"]`
5. Wait for results to load
6. Screenshot relevant results — save as ground-9-austlii-supreme-[date].png

### Expected output
NSW Supreme Court decisions on fixed trust / present entitlement — persuasive authority for the classification argument

---

---

### Difficulty log
- 2026-06-04: Failed at step 10 — Cloudflare bot-detection security verification page is blocking access to the AustLII search results — the page has been stuck on 'Just a moment... Performing security verification' for over 23 seconds and cannot be bypassed automatically. The search URL is: https://www.austlii.edu.au/cgi-bin/sinosrch.cgi?meta=&mask_path=au%2Fcases%2Fnsw%2FNSWSC&method=auto&query=unit+trust+fixed+trust+presently+entitled

## Jade.io — NSW Case Law
**URL:** https://jade.io/search?q=special+trust+unit+trust&jurisdiction=nsw
**Access:** ✅ Puppeteer + stealth
**Ground:** 9D
**Purpose:** Australian case law portal — alternative to Cloudflare-blocked AustLII for finding NCAT and Supreme Court decisions on unit trust / special trust classification

### Steps
1. Wait 3000ms for the Jade.io page to load
2. Screenshot the search results — save as ground-9-jade-caselaw-[date].png

### Expected output
NSW decisions mentioning "special trust" and "unit trust" — any holding that a unit trust is not a special trust is directly on point

---

### Learned steps
1. navigate
2. click "textbox"
3. navigate
4. navigate
5. navigate
6. wait
7. navigate
8. navigate
9. navigate
10. navigate
11. navigate
12. done

## GROUND 9E — Legislative Intent

---

## NSW Parliament Hansard
**URL:** https://www.parliament.nsw.gov.au/search/Pages/AdvancedSearchHome.aspx
**Access:** ✅ Puppeteer + stealth
**Ground:** 9E
**Purpose:** Find second reading speeches for LTMA amendments introducing s3A — shows Parliament's intent that unit trusts were excluded from "special trust"

### Steps
1. Wait for the SharePoint Hansard search page to fully load — confirm the search text field and Search button are visible
   → waitForSelector(`input[type="text"].enter, input.enter`)
3. Fill the main search field with "Land Tax Management special trust"
   → `input[type="text"].enter` (class="enter", no id)
4. In the House dropdown, select "Both" if visible — this field is a SharePoint form element; if not discoverable, leave at default (searches both houses)
5. Click Search
   → `input[type="button"].submit` (class="submit")
6. Wait for results to load
   → waitForSelector(`.searchResults, .ms-srch-result, table`)
7. Screenshot the results list — save as ground-9-hansard-[date].png

### Expected output
Second reading speeches referencing "special trust" in context of Land Tax Management Act amendments

---

### Learned steps
1. wait
2. fetch
3. fetch
4. fetch
5. fetch
6. navigate
7. fetch
8. fetch
9. fetch
10. fetch
11. fetch
12. fetch
13. done

## NSW Parliament Bills
**URL:** https://www.parliament.nsw.gov.au/bills
**Access:** ✅ Puppeteer + stealth
**Ground:** 9E
**Purpose:** Find LTMA amendment bills to access their explanatory notes on the special trust provisions

### Steps
1. Wait for the NSW Parliament Bills page to load — confirm a search field or bills list is visible
   → waitForSelector(`input[type="text"].enter, input.enter, table, .result`)
3. Fill the search field with "Land Tax Management Amendment"
   → `input[type="text"].enter` (class="enter", no id)
4. Press Enter or click Search
   → `input[type="button"].submit` (class="submit")
5. Wait for results to load
6. Screenshot the bills list — save as ground-9-bills-[date].png

### Expected output
List of LTMA amendment bills with links to explanatory notes on the special trust provisions

---

---

### Learned steps
1. wait
2. screenshot → ground-9-bills
3. click "input[type='text'].enter"
4. click "https://www.parliament.nsw.gov.au/bills/Pages/bills-search-results.aspx?q=Land+Tax+Management+Amendment"
5. click "https://www.parliament.nsw.gov.au/bills/Pages/bills-search-results.aspx?q=Land+Tax+Management+Amendment"
6. click "https://www.parliament.nsw.gov.au/bills/Pages/bills-search-results.aspx?q=Land+Tax+Management+Amendment"
7. click "https://www.parliament.nsw.gov.au/bills/Pages/bills-search-results.aspx?q=Land+Tax+Management+Amendment"
8. click "link with name 'Bills'"
9. click "link with name 'Skip to main content'"
10. click "link with name 'Turn on more accessible mode'"
11. click "backendNodeId:15669"
12. click "https://www.parliament.nsw.gov.au/bills/Pages/bills-search-results.aspx?q=Land+Tax+Management+Amendment"
13. click "RootWebArea"
14. screenshot → ground-9-search-results
15. done

### Difficulty log
- 2026-06-05: Failed at step 15 — Max iterations reached without completing task

## ATO — Trust Income and Present Entitlement
**URL:** https://www.ato.gov.au/businesses-and-organisations/trusts/tax-on-trusts/trust-income
**Access:** ✅ Puppeteer + stealth
**Ground:** 9C
**Purpose:** ATO guidance on "presently entitled" — the same federal concept Revenue NSW uses in its 4-part fixed trust test. Shows the concept is well-established in Australian tax law.

### Steps
1. Wait 2000ms for the ATO page to load
2. Screenshot the full page — save as ground-9-ato-trust-income-[date].png
3. Scroll down 2000px
4. Screenshot — save as ground-9-ato-trust-income-scroll-[date].png

### Expected output
ATO explanation of "presently entitled" to trust income — confirms the federal legal concept underpinning Revenue NSW's fixed trust test

---

### Learned steps
1. navigate
2. navigate
3. navigate
4. navigate
5. navigate
6. navigate
7. navigate
8. navigate
9. navigate
10. done

### Difficulty log
- 2026-06-05: Failed at step 5 — The ATO page at https://www.ato.gov.au/businesses-and-organisations/trusts/tax-on-trusts/trust-income returns a 404 error, and the target URL https://www.ato.gov.au/individuals-and-families/investments-and-assets/trusts/trust-income-and-present-entitlement is also unreachable via navigation actions available in this environment. The ATO has restructured its website and the specific 'Trust income and present entitlement' page is no longer at the expected URL. Unable to retrieve the ATO guidance on 'presently entitled' from this source.

## GROUND 9F — Comparative Law

---

## Victoria SRO — Trusts and Land Tax
**URL:** https://www.sro.vic.gov.au/owning-property/land-tax/companies-and-trusts/trusts-and-land-tax
**Access:** ✅ Puppeteer + stealth
**Ground:** 9F
**Purpose:** VIC separately classifies unit trusts, fixed trusts, and discretionary trusts — comparative law showing unit trusts are a distinct category nationally

### Steps
1. Wait for the page to fully load — confirm the "Trusts and land tax" article content is visible
   → waitForSelector(`main, article, .content`)
2. Full-page screenshot — save as ground-9-vic-trusts-[date].png

### Expected output
VIC trust classification: discretionary trusts at surcharge rates; unit/fixed trusts notified to SRO assessed at general rates

---

### Learned steps
1. screenshot → ground-9-vic-trusts
2. done

## Victoria SRO — Trust Structures
**URL:** https://www.sro.vic.gov.au/owning-property/land-tax/companies-and-trusts/trust-structures-and-land-tax
**Access:** ✅ Puppeteer + stealth
**Ground:** 9F
**Purpose:** Detailed VIC classification criteria — beneficiary entitlement certainty as key distinction between fixed and discretionary trusts

### Steps
1. Wait for the page to fully load — confirm the "Trust structures and land tax" article is visible
   → waitForSelector(`main, article, .content`)
2. Full-page screenshot — save as ground-9-vic-structures-[date].png

### Expected output
VIC definitions: discretionary trusts (trustee decides distribution), fixed trusts (predetermined), and treatment differences — directly comparable to NSW LTMA s3A

---

### Learned steps
1. screenshot → ground-9-vic-structures
2. done

## QRO — Land Tax (trusts)
**URL:** https://qro.qld.gov.au/land-tax/
**Access:** ✅ Puppeteer + stealth
**Ground:** 9F
**Purpose:** QLD land tax treatment of trusts — navigate to trust subsection for comparative law

### Steps
1. Wait for the page to fully load — confirm the QRO land tax page with navigation links is visible
   → waitForSelector(`a[href="/land-tax/calculate/"]`)
3. Click on the "Calculating" subsection link (covers trust classification under QLD)
   → `a[href="/land-tax/calculate/"]` (text "Calculating")
4. Screenshot the trust classification content — save as ground-9-qro-land-tax-[date].png

### Expected output
QLD rules for trust land tax — any unit trust or fixed trust classification showing national approach

---

## QRO — Public Rulings
**URL:** https://qro.qld.gov.au/land-tax/public-rulings/
**Access:** ✅ Puppeteer + stealth
**Ground:** 9F
**Purpose:** Browse for any QLD ruling on unit trust / fixed trust classification analogous to NSW LTMA s3A

### Steps
1. Wait for the page to fully load — confirm the search input and rulings content are visible
   → waitForSelector(`input[name="query"]`)
3. Fill the search field with "unit trust"
   → `input[name="query"]` (ariaLabel="Search Queensland Revenue Office")
4. Click Search
   → `button.liwp-button--type-primary[type="submit"]`
5. Wait for results to load
6. Screenshot results — save as ground-9-qro-rulings-[date].png

### Expected output
Any QLD public ruling classifying unit trusts for land tax purposes — persuasive comparative law

---

---

### Learned steps
1. scroll
2. screenshot → ground-9-qro-rulings-page
3. scroll
4. click "a[href='https://qro.qld.gov.au/public-rulings/#main']"
5. click "link[name='Skip to content']"
6. click "backendNodeId:69"
7. click "a[href='https://qro.qld.gov.au/contact-qro/']"
8. wait
9. done

## SA RevenueSA — Land Tax Trusts
**URL:** https://www.revenuesa.sa.gov.au/taxes-and-royalties/land-tax
**Access:** ✅ Puppeteer + stealth
**Ground:** 9F
**Purpose:** South Australia's land tax trust classification — third comparative jurisdiction (alongside VIC and QLD) showing unit trusts are treated distinctly from discretionary trusts nationally

### Steps
1. Wait 2000ms for the RevenueSA page to load
2. Screenshot the full page — save as ground-9-sa-land-tax-[date].png
3. Scroll down 1500px
4. Screenshot — save as ground-9-sa-land-tax-scroll-[date].png

### Expected output
SA trust classification rules for land tax — any distinction between unit trusts / fixed trusts and discretionary trusts is persuasive comparative law

---

### Learned steps


## GROUND 9H — Objection Procedure

---

## Revenue NSW — Land Tax Objections
**URL:** https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/land-tax/your-assessment-notice/land-tax-objections
**Access:** ✅ Puppeteer + stealth
**Ground:** 9H
**Purpose:** Screenshot the 60-day deadline, email address (objection@revenue.nsw.gov.au), and NCAT appeal path

### Steps
1. Wait for the page to fully load — confirm the land tax objections content with 60-day deadline is visible
   → waitForSelector(`main, .main, article`)
2. Full-page screenshot — save as ground-9-objections-[date].png

### Expected output
60-day deadline from notice issue date, email to objection@revenue.nsw.gov.au, 90-day processing, NCAT external review if refused

### Learned steps
1. screenshot → ground-9-objections
2. scroll
3. screenshot → ground-9-objections-scroll1
4. done

## Revenue NSW — Assessment Notice
**URL:** https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/land-tax/your-assessment-notice
**Access:** ✅ Puppeteer + stealth
**Ground:** 9H
**Purpose:** Screenshot confirming two objection channels — Revenue NSW (legislation) AND VG (land value) — both 60 days from notice

### Steps
1. Wait for the page to fully load — confirm the assessment notice content with objection channels is visible
   → waitForSelector(`main, .main, article`)
2. Full-page screenshot — save as ground-9-notice-[date].png

### Expected output
Two objection channels confirmed: (1) Revenue NSW 60-day — legislation incorrectly applied; (2) VG 60-day — land value dispute

### Learned steps
1. screenshot → ground-9-notice
2. done

## NCAT — Administrative & Equal Opportunity Division
**URL:** https://www.ncat.nsw.gov.au
**Access:** ✅ Puppeteer + stealth
**Ground:** 9H (appeal)
**Purpose:** Screenshot showing Administrative and Equal Opportunity Division handles State revenue matters — appeal body if Revenue NSW refuses objection

### Steps
1. Wait for the NCAT homepage to fully load — confirm the division links or navigation menu is visible
   → waitForSelector(`main, #mainContent`)
2. Screenshot the divisions overview — save as ground-9-ncat-[date].png

### Expected output
Administrative and Equal Opportunity Division listed with "State revenue" as case type — confirms NCAT jurisdiction over Revenue NSW objection refusals

---

---

### Difficulty log
- 2026-06-04: Failed at step 15 — Max iterations reached without completing task

## GROUNDS 3, 4, 5, 6 — VG Public Tools and Alternative Sources

---

## VG Land Value Search
**URL:** https://valuation.property.nsw.gov.au/embed/landValueSearch
**Access:** ✅ Puppeteer (JS-heavy — wait for form to load)
**Ground:** 3, 4, 5, 6
**Purpose:** Retrieve VG's recorded area, zone, lot/DP, and land value — fills areaOnNotice, zoningOnNotice, lotDpOnNotice

### Steps
1. Wait for the page to load — if a login/register wall appears, emit error immediately (login required)
2. If the search form loads, fill the PID search field with [PID]  ← e.g. "3701422"
4. Click the Search button
5. Wait for results to load
6. Screenshot the full results — save as ground-3456-vg-land-value-[date].png

### Expected output
VG's recorded: area (m²), zone, lot/DP, land value as at base date, property description. Also shows if multiple PIDs are grouped (relevant to Ground 5).

⚠️ Login required — this embed URL redirects to a login/register wall. Selectors cannot be discovered without credentials.

---

### Difficulty log
- 2026-06-04: Failed at step 10 — The VG Land Value Search at https://valuation.property.nsw.gov.au/embed/landValueSearch requires login/registration to access. The portal redirects to a login page and the embed URL is not publicly accessible without authentication. A login wall blocks access to the land value search form.
- 2026-06-04: Failed at step 5 — Login wall encountered — the VG Land Value Search at https://valuation.property.nsw.gov.au/embed/landValueSearch redirects to a login/register page and no credentials are available to authenticate. The search form cannot be accessed without logging in.
- 2026-06-04: Failed at step 4 — Login wall encountered at https://valuation.property.nsw.gov.au/login — the VG Land Value Search embed URL redirects to a login/register page requiring credentials. No search form is accessible without authentication.

## VG Property Address Enquiry
**URL:** https://valuation.property.nsw.gov.au/embed/propertyAddressEnquiry
**Access:** ✅ Puppeteer (JS-heavy — wait for form to load)
**Ground:** 3, 4
**Purpose:** Cross-check lot/DP and property number by address — confirms VG's recorded property identity

### Steps
1. Wait for the page to load — if a login/register wall appears, emit error immediately (login required)
2. If the search form loads: Option A: Fill the address field with [ADDRESS]  ← e.g. "1020 MELIA CT CASTLE HILL"
   Option B: Fill lot field with [LOT] and DP field with [DP]  ← e.g. "1" and "576773"
4. Click Search
5. Wait for results
6. Screenshot results — save as ground-34-vg-address-[date].png

### Expected output
Property number (PID), lot/DP as recorded by VG, property description

⚠️ Login required — this embed URL also redirects to a login/register wall. Selectors cannot be discovered without credentials.

---

### Difficulty log
- 2026-06-04: Failed at step 10 — The VG Property Address Enquiry embed page (https://valuation.property.nsw.gov.au/embed/propertyAddressEnquiry) could not be accessed directly — the site only shows a Login/Register portal and navigation to the embed URL is blocked or requires authentication. The search form for address lookup was never rendered, so no property results for 1020 MELIA CT CASTLE HILL NSW could be retrieved.
- 2026-06-04: Failed at step 6 — The VG Property Address Enquiry embed URL redirects to a login/register wall at valuation.property.nsw.gov.au and the page only shows Login and Register links with no search form accessible. The embed requires authenticated credentials to access the property address search functionality, which are not available in this session.

## VG Property Sales Enquiry
**URL:** https://valuation.property.nsw.gov.au/embed/propertySalesEnquiry
**Access:** ✅ Puppeteer (JS-heavy — wait for form to load)
**Ground:** 1 (if pursued)
**Purpose:** Free comparable sales data for NSW properties — no login required

### Steps
1. Wait for the page to load — if a login wall appears, emit error immediately
2. If the search form loads, fill the address or suburb field with [ADDRESS]  ← e.g. "1020 MELIA CT CASTLE HILL"
4. Click Search
5. Wait for results
6. Screenshot results — save as ground-1-vg-sales-[date].png

### Expected output
Recent comparable sales: address, sale date, sale price, land area — starting point for Ground 1 evidence

Note: Form is behind JavaScript — exact field selectors to be discovered on first run.

### Difficulty log
- 2026-06-04: Login wall — same VG portal domain as Land Value Search and Property Address Enquiry, which both redirect to a login/register wall. Skipped until VG portal credentials are added to .env.

---

---

## NSW Valuer General Public Land Value Search
**URL:** https://www.valuergeneral.nsw.gov.au/land_values/land_value_search/land_value_enquiry
**Access:** ✅ Puppeteer + stealth
**Ground:** 3, 4, 5, 6
**Purpose:** Original VG land value enquiry page (no login required) — shows VG recorded area, zone, lot/DP, and land value for the property

### Steps
1. Wait 3000ms for the page to load — confirm a search form or results are visible
2. Look for a PID or property ID search field and type [PID]
3. Click Search or press Enter
4. Wait 2000ms for results
5. Screenshot the results showing area, zone, and lot/DP — save as ground-3456-vg-public-[date].png

### Expected output
VG recorded: area (m²), zone, lot/DP, land value, property description — without login requirement

---

### Difficulty log
- 2026-06-07: PERMANENTLY RETIRED — All NSW Government VG redirect URLs return 404 and the direct valuergeneral.nsw.gov.au URL also failed repeatedly. Replaced by NSW Land Parcel Property Theme FeatureServer for area (Ground 3) and NSW EPI Primary Planning Layers MapServer for zone (Ground 4).

## NSW Planning Portal — LEP Finder
**URL:** https://www.planningportal.nsw.gov.au/LepFinder/
**Access:** ✅ Puppeteer + stealth
**Ground:** 4
**Purpose:** Simpler alternative to the Angular Spatial Viewer — confirms zone and LEP for an address. Static page, no SPA rendering issues.

### Steps
1. Wait 2000ms for the LEP Finder page to load — confirm the address search input is visible
2. Type [ADDRESS] into the address search field
   → look for `input[type="text"], input[placeholder*="address"], input[placeholder*="search"]`
3. Click Search or press Enter
4. Wait 2000ms for results
5. Screenshot the zone results — save as ground-4-lep-finder-[date].png

### Expected output
Zone code (e.g. C4 Environmental Living), LEP name (The Hills LEP 2019), zoning objectives

---

### Difficulty log
- 2026-06-07: PERMANENTLY RETIRED — URL consistently returns 404. Replaced by NSW EPI Primary Planning Layers MapServer (direct REST API, no SPA) for zone (Ground 4).

## GROUND 3 — Area

---

## NSW LRS — Cadastral Records Enquiry
**URL:** https://online.nswlrs.com.au/wps/portal/six/find-records
**Access:** ✅ Puppeteer + stealth
**Ground:** 3
**Purpose:** Free cadastral records — independently confirms registered area for Lot [LOT] DP [DP]

### Steps
1. Wait for the Find Records page to load — confirm navigation links or content is visible
   → waitForSelector(`a, iframe, [title]`, timeout 10000)
3. Click on "Cadastral Records Enquiry (CRE)"
   → ⚠️ IBM WebSphere/AJAX framework — CRE link is inside an iframe or shadow DOM not accessible via standard CSS selectors. Switch to frame first: `const frames = page.frames(); const cre = frames.find(f => f.url().includes('six'))` then look for `a` containing "Cadastral Records Enquiry"
4. Fill Lot field with [LOT]  ← e.g. "1"
5. Fill DP field with [DP]  ← e.g. "576773"
6. Click Search
7. Screenshot the cadastral record — save as ground-3-lrs-[date].png

### Expected output
Registered area (m²), lot dimensions, plan type, plan date

---

---

### Difficulty log
- 2026-06-04: Failed at step 10 — The NSW LRS Find Records page appears to have loaded but the accessibility tree shows only role='none' elements with no visible links, buttons, or interactive content — the page content (including the Cadastral Records Enquiry link) is not rendering in the accessible DOM, likely due to the portal's IBM WebSphere/AJAX framework rendering content inside iframes or shadow DOM that is not accessible to the automation agent. Unable to locate or click the CRE link.

## GROUND 4 — Zoning / Description

---

## NSW Planning Spatial Viewer
**URL:** https://www.planningportal.nsw.gov.au/spatialviewer/
**Access:** ✅ Puppeteer + stealth
**Ground:** 3, 4
**Purpose:** Confirm lot area, zone, LEP name — property details panel shows both area (Ground 3) and zone (Ground 4) in one view

### Steps
1. Wait 8000ms for the Angular app to load
2. Click the "I Agree" button → `button[aria-label="Close dialog"]`
3. Wait 1000ms
4. Type [ADDRESS] into the address field → `input#mat-input-0`
5. Press Enter
6. Wait 4000ms for the map to zoom and zone to render
7. Screenshot — save as ground-34-planning-[date].png

### Expected output
Zone C4 Environmental Living, The Hills LEP 2019, lot area ~66,167 m², Lot 1 DP 576773

### Learned steps
1. wait
2. wait
3. screenshot → ground-34-planning-initial
4. click "button[aria-label='Close dialog']"
5. wait
6. click "input#mat-input-0"
7. type "input#mat-input-0" → [ADDRESS]
8. press
9. wait
10. screenshot → ground-34-planning-after-search
11. done

## GROUNDS 3, 5, 6 — Cadastral Map

---

## SIX Maps
**URL:** https://maps.six.nsw.gov.au/apps/3.5/
**Access:** ✅ Puppeteer + stealth
**Ground:** 3, 5, 6
**Purpose:** Confirm cadastral boundaries, area, and adjacent lot numbers

### Steps
⚠ DO NOT take any screenshot until step 7. The map loads early but shows no property — it is not evidence yet.
1. Wait 10000ms for the Dojo/ArcGIS app to fully load — the Terms dialog appears after initialisation
2. Click the "I Accept" button to dismiss the Terms & Conditions dialog
   → `span#dijit_form_Button_3[role="button"]`
3. Wait 1000ms for the dialog to close
4. Type [ADDRESS] into the address search field
   → `input#dijit_form_ValidationTextBox_5`
5. Click the Search button
   → `div#dijit_form_ComboButton_0_button[role="button"]`
6. Wait 4000ms for the map to zoom to the parcel
7. ✅ NOW screenshot the cadastral map showing the lot boundary — save as ground-356-sixmaps-[date].png

### Expected output
Lot [LOT] DP [DP] shown on cadastral map with area and adjacent lot/DP numbers visible

### Learned steps
1. wait
2. click "span#dijit_form_Button_3[role='button']"
3. wait
4. click "input#dijit_form_ValidationTextBox_5"
5. type "input#dijit_form_ValidationTextBox_5" → [ADDRESS]
6. click "div#dijit_form_ComboButton_0_button[role='button']"
7. wait
8. screenshot → ground-356-sixmaps-current-state
9. press
10. wait
11. screenshot → ground-356-sixmaps-check
12. done

## GROUND 1 — Land Value (if pursued)

---

## NSW EPA Contaminated Land
**URL:** http://www.epa.nsw.gov.au/your-environment/contaminated-land
**Access:** ✅ Puppeteer — HTTP only (HTTPS redirects incorrectly)
**Ground:** 1
**Purpose:** Check if [ADDRESS] is a notified contaminated site — physical constraint affecting value

### Steps
1. Wait for the contaminated land page to load — confirm navigation links including "Record of notices" are visible
   → waitForSelector(`main, #content, .content-main`)
3. Find and click the "Record of notices" search link in the page content
   → `a` containing text "Record of notices" (text-based click — no stable ID found; search page content area)
4. Search by [ADDRESS]  ← e.g. "1020 MELIA CT CASTLE HILL"
5. Screenshot the result — save as ground-1-epa-[date].png

### Expected output
Confirmation no contamination notice for the property — or notice details if one exists

---

---

## VG Objection Portal (Lodge)

---

## NSW VG Objection Portal
**URL:** https://portal.value.nsw.gov.au/prweb/PRAuth
**Access:** ✅ Puppeteer (Pega SPA — login required)
**Ground:** All (lodge objection)
**Purpose:** Lodge the objection — login, find property by PID, complete objection wizard

### Steps
1. Wait for the Azure B2C login form to load — confirm email and password fields are visible
   → waitForSelector(`a#forgotPassword`, timeout 10000) — this anchor confirms the login page is ready
   → The actual email/password fields are served via Azure B2C (vnswcitizensprd.onmicrosoft.com) — they may be in the main frame or an embedded frame
3. Enter email credentials
   → `input[type="email"]` (Azure B2C email field)
4. Enter password
   → `input[type="password"]` (Azure B2C password field)
5. Click the login/next button
   → `button[type="submit"]` or `button#next`
   → Note: Pega SPA generates dynamic IDs per session — use `[type]` and `[aria-label]` selectors only
6. Handle MFA if prompted
7. Once logged in, search for property using [PID]  ← e.g. "3701422"
8. Click on the property result
9. Click "Start objection" or equivalent
10. Select interest type (owner)
11. On "Reason for objection" — tick applicable ground checkboxes
12. Fill supporting text fields from objection-output.json
13. Upload evidence files from automation/evidence/ folder
14. Click Next through wizard steps
15. Click Submit / Lodge
16. Screenshot the confirmation screen with lodgement number — save as ground-all-vg-portal-[date].png

### Expected output
Lodgement confirmation number from the VG portal

Note: This is a Pega SPA — all navigation is JavaScript-driven with dynamically generated IDs. Use `[aria-label]`, `[data-test-id]`, and semantic `[type]` selectors throughout. Login uses Azure B2C.

### Difficulty log
- 2026-06-04: Requires login credentials — Azure B2C authentication required. Add PORTAL_EMAIL and PORTAL_PASSWORD to .env before running this source.
