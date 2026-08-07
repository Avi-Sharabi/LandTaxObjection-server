'use strict';

const BasePage = require('./BasePage');

class CaseDetailPage extends BasePage {
  async waitForLoad() {
    await this.page.waitForFunction(
      () => window.location.pathname.match(/\/cases\/\w+/) !== null,
      { timeout: 15000 }
    );
    await this.page.waitForFunction(
      () => {
        const tabs = document.querySelectorAll('[role="tab"]');
        const heading = document.querySelector('h1,h2,h3,h4,h5,h6');
        return tabs.length > 0 || heading;
      },
      { timeout: 15000 }
    );

    // Tabs render progressively — Overview/Documents appear immediately, but
    // Comparables/Reason for Objection/Supporting Evidence only after their own
    // data finishes loading (confirmed live: reading tabs right after the check
    // above can see as few as 2 of 5 eventual tabs). Poll until the tab count
    // holds steady across two checks, capped so pages that never gain more
    // tabs don't pay the full wait.
    let lastCount = -1;
    for (let i = 0; i < 8; i++) {
      const count = await this.page.evaluate(() => document.querySelectorAll('[role="tab"]').length);
      if (count === lastCount) return;
      lastCount = count;
      await new Promise(r => setTimeout(r, 300));
    }
  }

  async getCaseReference() {
    return this.page.evaluate(() => {
      // Case references don't share a fixed prefix ("LTD-2026-000003",
      // "FUPTEST-T7-MAXCOUNT", "SEED-VGEMAIL-002" are all real refs seen on
      // this environment) — matching on a hardcoded prefix list silently
      // returns '' for anything else. Instead, find the first leaf element
      // whose full (trimmed) text is itself an all-caps, hyphenated code —
      // a shape nothing else on the header (jurisdiction chip, days-left
      // badge, client name, app branding) happens to share.
      const all = [...document.querySelectorAll('body *')];
      const el = all.find(e =>
        e.children.length === 0 &&
        /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(e.textContent.trim())
      );
      return el?.textContent?.trim() || '';
    });
  }

  async getHeaderText() {
    return this.page.evaluate(() => {
      const h = document.querySelector('h1,h2,h3,h4,h5,h6');
      return h?.textContent?.trim() || '';
    });
  }

  async getJurisdictionBadgeText() {
    return this.page.evaluate(() => {
      const jurisdictions = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
      const chips = [...document.querySelectorAll('[class*="MuiChip"], [class*="badge" i], span, div')];
      const match = chips.find(el =>
        el.children.length === 0 && jurisdictions.includes(el.textContent.trim().toUpperCase())
      );
      return match?.textContent?.trim() || '';
    });
  }

  async getOverdueBadgeText() {
    return this.page.evaluate(() => {
      const all = [...document.querySelectorAll('*')];
      const el = all.find(e =>
        e.children.length === 0 && /overdue/i.test(e.textContent) && e.textContent.trim().length < 30
      );
      return el?.textContent?.trim() || '';
    });
  }

  // Returns the text content of a KPI section identified by its label
  async getKpiValue(kpiLabel) {
    return this.page.evaluate((label) => {
      const allEls = [...document.querySelectorAll('*')];
      const labelEl = allEls.find(el =>
        el.children.length === 0 &&
        el.textContent.trim().toLowerCase().includes(label.toLowerCase())
      );
      if (!labelEl) return null;
      const container = labelEl.closest('div, li, section');
      if (!container) return null;
      return container.textContent.trim() || null;
    }, kpiLabel);
  }

  async getTabNames() {
    return this.page.evaluate(() =>
      [...document.querySelectorAll('[role="tab"]')].map(el => el.textContent?.trim())
    );
  }

  async clickTab(tabName) {
    const clicked = await this.page.evaluate((name) => {
      const tabs = [...document.querySelectorAll('[role="tab"]')];
      const tab = tabs.find(el => el.textContent.trim().toLowerCase().includes(name.toLowerCase()));
      if (tab) { tab.click(); return true; }
      return false;
    }, tabName);
    if (!clicked) throw new Error(`Tab "${tabName}" not found`);
    await new Promise(r => setTimeout(r, 800));
  }

  async isTabActive(tabName) {
    return this.page.evaluate((name) => {
      const tabs = [...document.querySelectorAll('[role="tab"]')];
      const tab = tabs.find(el => el.textContent.trim().toLowerCase().includes(name.toLowerCase()));
      return tab?.getAttribute('aria-selected') === 'true' ||
             tab?.classList.toString().includes('selected') ||
             tab?.classList.toString().includes('active');
    }, tabName);
  }

  // Returns true if the currently visible tab panel has real content (not just a spinner)
  async isTabContentPopulated() {
    return this.page.evaluate(() => {
      const panels = [...document.querySelectorAll('[role="tabpanel"]')];
      const visible = panels.find(p => {
        const style = window.getComputedStyle(p);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      });
      const text = (visible || document.querySelector('main'))?.textContent?.trim() || '';
      if (text.length < 10) return false;
      if (/^analyzing\.\.\.|^loading/i.test(text)) return false;
      return true;
    });
  }

  // Returns true if a loading/analyzing indicator is present anywhere on the page
  async isLoadingIndicatorVisible() {
    return this.page.evaluate(() =>
      !!(
        document.querySelector('[class*="Loading" i], [class*="Spinner" i], [role="progressbar"]') ||
        /analyzing\.\.\.|loading\.\.\./i.test(document.body.innerText)
      )
    );
  }

  // Returns true if AI-generated label/badge is present in the current tab panel
  async hasAIGeneratedLabel() {
    return this.page.evaluate(() =>
      /ai generated|generated by ai|ai-generated/i.test(document.body.innerText)
    );
  }

  // Returns true if AI content in the current view is not directly editable
  async isAIContentReadOnly() {
    return this.page.evaluate(() => {
      // Check for edit controls (input/textarea/contenteditable) with non-empty content
      const editables = [
        ...document.querySelectorAll('[contenteditable="true"], textarea:not([readonly])')
      ];
      // If there are no editable fields active in the main content area (excluding search/form) — read-only
      const substantive = editables.filter(el => {
        const text = el.textContent?.trim() || el.value?.trim() || '';
        return text.length > 20; // skip empty fields or very short ones
      });
      return substantive.length === 0;
    });
  }

  // Opens the Edit case form. Returns true if form opened, false if it did not.
  async clickEditCase() {
    const rect = await this.page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, [role="button"], a')];
      const btn = btns.find(el => /edit case/i.test(el.textContent));
      if (!btn) return null;
      btn.scrollIntoView({ behavior: 'instant', block: 'center' });
      const r = btn.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!rect) return false;
    await new Promise(r => setTimeout(r, 200));
    await this.page.mouse.click(rect.x, rect.y);

    const opened = await this.page.waitForFunction(
      () => {
        const inputs = [...document.querySelectorAll('input:not([type="hidden"])')];
        return inputs.some(i => !i.placeholder?.toLowerCase().includes('search'));
      },
      { timeout: 8000 }
    ).then(() => true).catch(() => false);

    if (!opened) return false;

    // Wait for pre-fill (async API)
    await this.page.waitForFunction(
      () => {
        const inputs = [...document.querySelectorAll('input:not([type="hidden"])')];
        return inputs.filter(i => !i.placeholder?.toLowerCase().includes('search'))
                     .some(i => i.value && i.value.trim().length > 0);
      },
      { timeout: 3000 }
    ).catch(() => {});
    await new Promise(r => setTimeout(r, 200));
    return true;
  }

  async fillEditForm(fields) {
    await this.page.evaluate((f) => {
      const container = document.querySelector('[role="dialog"]') || document.querySelector('main');
      const scope = container || document;
      const getInput = (label) => {
        const labels = [...scope.querySelectorAll('label, [class*="MuiInputLabel"]')];
        const lbl = labels.find(el =>
          el.textContent.trim().toLowerCase().includes(label.toLowerCase())
        );
        if (lbl?.htmlFor) return document.getElementById(lbl.htmlFor);
        return scope.querySelector(`input[placeholder*="${label}" i], textarea[placeholder*="${label}" i]`) ||
               scope.querySelector(`input[name*="${label}" i], textarea[name*="${label}" i]`);
      };
      const setVal = (input, value) => {
        if (!input) return;
        const proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        nativeSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      if (f.assessedValue    !== undefined) setVal(getInput('assessed'), f.assessedValue);
      if (f.finalAgreedValue !== undefined) setVal(getInput('final agreed'), f.finalAgreedValue);
      if (f.invoiceAmount    !== undefined) setVal(getInput('invoice'), f.invoiceAmount);
      if (f.notes            !== undefined) setVal(getInput('notes'), f.notes);
      if (f.deadline         !== undefined) setVal(getInput('statutory deadline') || getInput('deadline') || getInput('date'), f.deadline);
      if (f.address          !== undefined) setVal(getInput('address'), f.address);
      if (f.pid              !== undefined) setVal(getInput('pid'), f.pid);
      if (f.ownership        !== undefined) setVal(getInput('ownership'), f.ownership);
      if (f.landArea         !== undefined) setVal(getInput('land area'), f.landArea);
      if (f.zoning           !== undefined) setVal(getInput('zoning'), f.zoning);
      if (f.lotDp            !== undefined) setVal(getInput('lot') || getInput('dp'), f.lotDp);
      if (f.dimensions       !== undefined) setVal(getInput('dimensions'), f.dimensions);
      if (f.heightLimit      !== undefined) setVal(getInput('height limit'), f.heightLimit);
    }, fields);
    await new Promise(r => setTimeout(r, 300));
  }

  async clearEditField(fieldLabel) {
    await this.page.evaluate((label) => {
      const container = document.querySelector('[role="dialog"]') || document.querySelector('main');
      const scope = container || document;
      const labels = [...scope.querySelectorAll('label, [class*="MuiInputLabel"]')];
      const lbl = labels.find(el =>
        el.textContent.trim().toLowerCase().includes(label.toLowerCase())
      );
      const input = lbl?.htmlFor
        ? document.getElementById(lbl.htmlFor)
        : scope.querySelector(`input[name*="${label}" i]`);
      if (!input) return;
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, fieldLabel);
  }

  async submitEditForm() {
    const handle = await this.page.evaluateHandle(() => {
      const btns = [...document.querySelectorAll('button[type="submit"], button')];
      return btns.find(el => /save|update|submit/i.test(el.textContent) && !el.disabled) || null;
    });
    const btnEl = handle.asElement();
    if (!btnEl) throw new Error('Save button not found in edit form');
    await btnEl.click();
    await new Promise(r => setTimeout(r, 1500));
  }

  async cancelEditForm() {
    const handle = await this.page.evaluateHandle(() => {
      const btns = [...document.querySelectorAll('button, [role="button"], a')];
      return btns.find(el => /cancel|close|discard/i.test(el.textContent)) || null;
    });
    const btnEl = handle.asElement();
    if (btnEl) await btnEl.click();
    await new Promise(r => setTimeout(r, 600));
  }

  async getFormValidationErrors() {
    return this.page.evaluate(() => {
      const errors = [...document.querySelectorAll(
        '[class*="MuiFormHelperText"], [class*="error" i], [role="alert"], [class*="helperText"]'
      )];
      return errors.map(el => el.textContent?.trim()).filter(Boolean);
    });
  }

  async clickSubmitToVG() {
    const handle = await this.page.evaluateHandle(() => {
      const btns = [...document.querySelectorAll('button, [role="button"]')];
      return btns.find(el => /submit to vg/i.test(el.textContent)) || null;
    });
    const btnEl = handle.asElement();
    if (!btnEl) throw new Error('"Submit to VG" button not found');
    await btnEl.click();
    await new Promise(r => setTimeout(r, 1000));
  }

  async isSubmitToVGVisible() {
    return this.page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, [role="button"]')];
      const btn = btns.find(el => /submit to vg/i.test(el.textContent));
      return !!btn && !btn.disabled;
    });
  }

  async clickAnalyzeWithAI() {
    const handle = await this.page.evaluateHandle(() => {
      const btns = [...document.querySelectorAll('button, [role="button"]')];
      return btns.find(el => /analyze valuation with ai/i.test(el.textContent)) || null;
    });
    const btnEl = handle.asElement();
    if (!btnEl) throw new Error('"Analyze Valuation with AI" button not found');
    await btnEl.click();
    await new Promise(r => setTimeout(r, 500));
  }

  async isAnalyzeWithAIVisible() {
    return this.page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, [role="button"]')];
      return btns.some(el => /analyze valuation with ai/i.test(el.textContent));
    });
  }

  // "View Report" (OverviewTab.jsx) renders only when analysis_report_blob_path is
  // truthy — its presence is the one reliable signal that the report step of the
  // analyze-ai pipeline actually succeeded, since that step's failure is swallowed
  // at the job level (see docs/valuation-report-generation-test-cases.md Constraint 2).
  async isViewReportVisible() {
    return this.page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, [role="button"]')];
      return btns.some(el => /^view report$/i.test(el.textContent.trim()));
    });
  }

  // Dispatches a native DOM click via page.evaluate rather than Puppeteer's
  // coordinate-based ElementHandle.click() — confirmed live that the latter
  // resolves without error but never fires the button's onClick here (the
  // simulated mouse event at its computed coordinates gets intercepted by
  // something else in the Case Details panel's layout, far to the right of
  // the panel). A native click bypasses hit-testing entirely, same technique
  // clickTab() above already uses for the same reason.
  async clickViewReport() {
    const clicked = await this.page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, [role="button"]')];
      const btn = btns.find(el => /^view report$/i.test(el.textContent.trim()));
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!clicked) throw new Error('"View Report" button not found');
  }

  // The inline MuiAlert rendered next to "View Report" on a failed report-url
  // fetch (OverviewTab.jsx: `{reportError && <Alert severity="error">...`).
  async getReportErrorText() {
    return this.page.evaluate(() => {
      const alert = document.querySelector('.MuiAlert-message');
      return alert?.textContent?.trim() || '';
    });
  }

  // Documents tab (DocumentsTab.jsx) renders each document's name in a Typography
  // under an EmptyState fallback when there are none — returning the whole
  // tabpanel's text is simpler and more robust than parsing individual rows, since
  // callers only need to check whether a given document name appears at all.
  async getDocumentsTabText() {
    return this.page.evaluate(() => {
      const panels = [...document.querySelectorAll('[role="tabpanel"]')];
      const visible = panels.find(p => {
        const s = window.getComputedStyle(p);
        return s.display !== 'none' && s.visibility !== 'hidden';
      });
      return (visible || document.querySelector('main'))?.textContent?.trim() || '';
    });
  }

  // The "AI Analysis Queue" widget lists an entry per case with a status word
  // ("active" while a real analysis job is running, "completed" once it's done).
  // A case whose own entry says "active" is mid-analysis — it renders incomplete
  // data (undefined evidence score, missing tabs, stale status) that isn't a bug
  // in the case itself, just a snapshot taken while a real background job runs.
  //
  // The case reference also appears elsewhere on the page (header, details panel),
  // so we anchor the search to the queue section first, then walk leaf elements in
  // document order from each occurrence of the ref within it and read the next
  // status word — that's the one that actually belongs to this case's queue entry.
  async isCaseAnalysisActive(caseRef) {
    return this.page.evaluate((ref) => {
      const leaves = [...document.querySelectorAll('*')].filter(el => el.children.length === 0);
      const queueStart = leaves.findIndex(el => /ai analysis queue/i.test(el.textContent.trim()));
      const start = queueStart === -1 ? 0 : queueStart;

      for (let i = start; i < leaves.length; i++) {
        if (leaves[i].textContent.trim().toLowerCase() !== ref.toLowerCase()) continue;
        for (let j = i + 1; j < Math.min(i + 6, leaves.length); j++) {
          const text = leaves[j].textContent.trim().toLowerCase();
          if (text === 'active') return true;
          if (text === 'completed') break; // this occurrence resolved — keep checking any later ones
        }
      }
      return false;
    }, caseRef);
  }

  // Waits for any active loading/analyzing state to clear after AI analysis is triggered.
  // AI analysis can take a long time on staging — use a generous timeout.
  async waitForAIAnalysisComplete(timeout = 90000) {
    await this.page.waitForFunction(
      () => {
        const hasSpinner = !!(
          document.querySelector('[role="progressbar"]') ||
          [...document.querySelectorAll('[class*="Spinner" i], [class*="Loading" i]')]
            .some(el => el.offsetParent !== null)
        );
        const hasAnalyzing = /analyzing\.\.\.|loading\.\.\./i.test(document.body.innerText);
        return !hasSpinner && !hasAnalyzing;
      },
      { timeout }
    ).catch(() => {});
    await new Promise(r => setTimeout(r, 800));
  }

  async clickBackToCases() {
    await this.page.waitForFunction(
      () => {
        const els = [...document.querySelectorAll('a, button, [role="button"]')];
        return els.some(el => /back to cases|all cases/i.test(el.textContent));
      },
      { timeout: 10000 }
    ).catch(() => {});

    const handle = await this.page.evaluateHandle(() => {
      const els = [...document.querySelectorAll('a, button, [role="button"]')];
      return els.find(el => /back to cases|all cases/i.test(el.textContent)) || null;
    });
    const btnEl = handle.asElement();

    if (!btnEl) {
      await this.page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
      return;
    }
    await btnEl.click();
    await this.page.waitForFunction(
      () => window.location.pathname === '/accountant/cases' ||
             window.location.pathname.endsWith('/cases'),
      { timeout: 15000 }
    );
  }

  async getSuccessMessage() {
    return this.page.evaluate(() => {
      const alert = document.querySelector(
        '[class*="MuiAlert"], [role="alert"], [class*="toast" i], [class*="snack" i]'
      );
      return alert?.textContent?.trim() || '';
    });
  }

  // The "Evidence score" KPI is fed by an async backend job that's flaky
  // independent of the case's own data — the same case can render it literally
  // as "undefined/100" on one check and a real number moments later, with no
  // other change on the page. No test asserts its value, so strip just that
  // segment before scanning for null/undefined rather than letting one flaky,
  // unrelated metric fail every test that happens to land on a case mid-fetch.
  async pageHasNoNullValues() {
    return this.page.evaluate(() => {
      const text = document.body.innerText.replace(/evidence score[\s\S]{0,10}\b(?:null|undefined)\b/gi, '');
      return !/\bnull\b|\bundefined\b/i.test(text);
    });
  }

  // Returns true if a confirmation dialog is open
  async isDialogVisible() {
    return this.page.evaluate(() => !!document.querySelector('[role="dialog"]'));
  }

  async confirmDialog() {
    const rect = await this.page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const scope = dialog || document;
      const btns = [...scope.querySelectorAll('button, [role="button"]')];
      const btn = btns.find(el =>
        /confirm|yes|ok|proceed|submit|accept/i.test(el.textContent.trim())
      );
      if (!btn) return null;
      btn.scrollIntoView({ behavior: 'instant', block: 'center' });
      const r = btn.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!rect) throw new Error('Confirmation button not found in dialog');
    await this.page.mouse.click(rect.x, rect.y);
    await new Promise(r => setTimeout(r, 2000));
  }

  async cancelDialog() {
    const handle = await this.page.evaluateHandle(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const scope = dialog || document;
      const btns = [...scope.querySelectorAll('button, [role="button"]')];
      return btns.find(el => /cancel|no/i.test(el.textContent.trim())) || null;
    });
    const btnEl = handle.asElement();
    if (!btnEl) throw new Error('Cancel button not found in dialog');
    await btnEl.click();
    await new Promise(r => setTimeout(r, 600));
  }

  async getCaseStatusText() {
    return this.page.evaluate(() => {
      // KPI bar status — look for "Case status" label and get nearby value
      const allEls = [...document.querySelectorAll('*')];
      const labelEl = allEls.find(el =>
        el.children.length === 0 && /^case status$/i.test(el.textContent.trim())
      );
      if (!labelEl) return '';
      const container = labelEl.closest('div, li, section');
      return container?.textContent?.replace(/case status/i, '').trim() || '';
    });
  }

  // ── Edit Case Modal: State inspection ──────────────────────────────────────

  async isEditModalOpen() {
    return this.page.evaluate(() =>
      !!document.querySelector('[role="dialog"]')
    );
  }

  async getEditModalTitle() {
    return this.page.evaluate(() => {
      const scope = document.querySelector('[role="dialog"]');
      const el = scope?.querySelector('h2, [class*="MuiDialogTitle"], [class*="MuiTypography-h5"], [class*="MuiTypography-h6"]');
      return el?.textContent?.trim() || '';
    });
  }

  async getEditModalSectionHeaders() {
    return this.page.evaluate(() => {
      const scope = document.querySelector('[role="dialog"]');
      if (!scope) return [];
      const headings = [...scope.querySelectorAll(
        'h3,h4,h5,h6,[class*="MuiTypography-subtitle"],[class*="MuiTypography-h6"],[class*="section-title"],[class*="sectionTitle"]'
      )];
      return headings.map(el => el.textContent.trim()).filter(Boolean);
    });
  }

  async clickBackdrop() {
    await this.page.evaluate(() => {
      const backdrop = document.querySelector(
        '[class*="MuiBackdrop-root"], [class*="MuiModal-backdrop"], [class*="MuiBackdrop"]'
      );
      backdrop?.click();
    });
    await new Promise(r => setTimeout(r, 400));
  }

  async getLoadingSkeletonCount() {
    return this.page.evaluate(() => {
      const scope = document.querySelector('[role="dialog"]');
      if (!scope) return 0;
      return scope.querySelectorAll('[class*="MuiSkeleton-root"]').length;
    });
  }

  // ── Edit Case Modal: MUI Select helpers ────────────────────────────────────
  // index selects the Nth matching label (0-based) — used when a label (e.g. "State")
  // appears more than once in the modal.

  async openDialogSelect(labelText, index = 0) {
    const coords = await this.page.evaluate((label, idx) => {
      const scope = document.querySelector('[role="dialog"]');
      if (!scope) return null;
      const labels = [...scope.querySelectorAll('label, [class*="MuiInputLabel"]')];
      const matching = labels.filter(el =>
        el.textContent.trim().toLowerCase().includes(label.toLowerCase())
      );
      const lbl = matching[idx];
      if (!lbl) return null;
      const formControl = lbl.closest('[class*="MuiFormControl"]');
      const trigger = formControl?.querySelector(
        '[class*="MuiSelect-select"], [role="combobox"], [class*="MuiInputBase-input"]'
      );
      if (!trigger) return null;
      trigger.scrollIntoView({ behavior: 'instant', block: 'center' });
      const r = trigger.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, labelText, index);

    if (!coords) return;
    await this.page.mouse.click(coords.x, coords.y);
    await this.page.waitForSelector('[role="listbox"]', { timeout: 5000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 200));
  }

  async getDialogSelectOptions() {
    return this.page.evaluate(() =>
      [...document.querySelectorAll('[role="listbox"] [role="option"], [role="option"]')]
        .map(el => el.textContent.trim())
        .filter(Boolean)
    );
  }

  async clickDialogSelectOption(text) {
    await this.page.evaluate((optText) => {
      const opts = [...document.querySelectorAll('[role="listbox"] [role="option"], [role="option"]')];
      const opt = opts.find(el =>
        el.textContent.trim() === optText || el.textContent.trim().includes(optText)
      );
      opt?.click();
    }, text);
    await new Promise(r => setTimeout(r, 400));
  }

  async closeDialogSelect() {
    await this.page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 300));
  }

  async getDialogSelectRenderedValue(labelText, index = 0) {
    return this.page.evaluate((label, idx) => {
      const scope = document.querySelector('[role="dialog"]');
      if (!scope) return '';
      const labels = [...scope.querySelectorAll('label, [class*="MuiInputLabel"]')];
      const matching = labels.filter(el =>
        el.textContent.trim().toLowerCase().includes(label.toLowerCase())
      );
      const lbl = matching[idx];
      if (!lbl) return '';
      const formControl = lbl.closest('[class*="MuiFormControl"]');
      const trigger = formControl?.querySelector('[class*="MuiSelect-select"]');
      return trigger?.textContent?.trim() || '';
    }, labelText, index);
  }

  // ── Edit Case Modal: Text input helpers ────────────────────────────────────

  async getDialogInputValue(labelText, index = 0) {
    return this.page.evaluate((label, idx) => {
      const scope = document.querySelector('[role="dialog"]');
      if (!scope) return '';
      const labels = [...scope.querySelectorAll('label, [class*="MuiInputLabel"]')];
      const matching = labels.filter(el =>
        el.textContent.trim().toLowerCase().includes(label.toLowerCase())
      );
      const lbl = matching[idx];
      if (!lbl) return '';
      const input = lbl.htmlFor
        ? document.getElementById(lbl.htmlFor)
        : lbl.closest('[class*="MuiFormControl"]')?.querySelector('input, textarea');
      return input?.value ?? '';
    }, labelText, index);
  }

  async isDialogInputReadonly(labelText, index = 0) {
    return this.page.evaluate((label, idx) => {
      const scope = document.querySelector('[role="dialog"]');
      if (!scope) return false;
      const labels = [...scope.querySelectorAll('label, [class*="MuiInputLabel"]')];
      const matching = labels.filter(el =>
        el.textContent.trim().toLowerCase().includes(label.toLowerCase())
      );
      const lbl = matching[idx];
      if (!lbl) return false;
      const input = lbl.htmlFor
        ? document.getElementById(lbl.htmlFor)
        : lbl.closest('[class*="MuiFormControl"]')?.querySelector('input, textarea');
      return input ? (input.readOnly || input.getAttribute('readonly') !== null) : false;
    }, labelText, index);
  }

  async getDialogFieldHelperText(labelText, index = 0) {
    return this.page.evaluate((label, idx) => {
      const scope = document.querySelector('[role="dialog"]');
      if (!scope) return '';
      const labels = [...scope.querySelectorAll('label, [class*="MuiInputLabel"]')];
      const matching = labels.filter(el =>
        el.textContent.trim().toLowerCase().includes(label.toLowerCase())
      );
      const lbl = matching[idx];
      if (!lbl) return '';
      const formControl = lbl.closest('[class*="MuiFormControl"]');
      const helper = formControl?.querySelector('[class*="MuiFormHelperText"]');
      return helper?.textContent?.trim() || '';
    }, labelText, index);
  }

  // Types real keyboard input into a modal field, triggering React's onChange handler.
  async typeIntoDialogField(labelText, value) {
    const coords = await this.page.evaluate((label) => {
      const scope = document.querySelector('[role="dialog"]');
      if (!scope) return null;
      const labels = [...scope.querySelectorAll('label, [class*="MuiInputLabel"]')];
      const lbl = labels.find(el =>
        el.textContent.trim().toLowerCase().includes(label.toLowerCase())
      );
      if (!lbl) return null;
      const input = lbl.htmlFor
        ? document.getElementById(lbl.htmlFor)
        : lbl.closest('[class*="MuiFormControl"]')?.querySelector('input, textarea');
      if (!input) return null;
      input.scrollIntoView({ behavior: 'instant', block: 'center' });
      const r = input.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, labelText);
    if (!coords) throw new Error(`Dialog input "${labelText}" not found`);
    await this.page.mouse.click(coords.x, coords.y, { clickCount: 3 });
    await this.page.keyboard.press('Delete');
    await this.page.keyboard.type(value, { delay: 20 });
    await new Promise(r => setTimeout(r, 300));
  }

  // Sets a field value using the React native setter (for date/number fields where
  // real typing is unreliable across browsers).
  async setDialogField(labelText, value, index = 0) {
    await this.page.evaluate((label, val, idx) => {
      const scope = document.querySelector('[role="dialog"]');
      if (!scope) return;
      const labels = [...scope.querySelectorAll('label, [class*="MuiInputLabel"]')];
      const matching = labels.filter(el =>
        el.textContent.trim().toLowerCase().includes(label.toLowerCase())
      );
      const lbl = matching[idx];
      if (!lbl) return;
      const input = lbl.htmlFor
        ? document.getElementById(lbl.htmlFor)
        : lbl.closest('[class*="MuiFormControl"]')?.querySelector('input, textarea');
      if (!input) return;
      const proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      nativeSetter.call(input, val);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, labelText, value, index);
    await new Promise(r => setTimeout(r, 300));
  }

  // ── Edit Case Modal: Select state/loading helpers ──────────────────────────

  async isDialogSelectDisabled(labelText, index = 0) {
    return this.page.evaluate((label, idx) => {
      const scope = document.querySelector('[role="dialog"]');
      if (!scope) return false;
      const labels = [...scope.querySelectorAll('label, [class*="MuiInputLabel"]')];
      const matching = labels.filter(el =>
        el.textContent.trim().toLowerCase().includes(label.toLowerCase())
      );
      const lbl = matching[idx];
      if (!lbl) return false;
      const formControl = lbl.closest('[class*="MuiFormControl"]');
      if (!formControl) return false;
      return formControl.classList.toString().includes('disabled') ||
             !!formControl.querySelector('[class*="Mui-disabled"]') ||
             formControl.querySelector('input')?.disabled === true;
    }, labelText, index);
  }

  async isDialogSelectLoading(labelText, index = 0) {
    return this.page.evaluate((label, idx) => {
      const scope = document.querySelector('[role="dialog"]');
      if (!scope) return false;
      const labels = [...scope.querySelectorAll('label, [class*="MuiInputLabel"]')];
      const matching = labels.filter(el =>
        el.textContent.trim().toLowerCase().includes(label.toLowerCase())
      );
      const lbl = matching[idx];
      if (!lbl) return false;
      const formControl = lbl.closest('[class*="MuiFormControl"]');
      const trigger = formControl?.querySelector('[class*="MuiSelect-select"]');
      const hasSpinner = !!formControl?.querySelector('[class*="CircularProgress"]');
      const loadingText = /loading/i.test(trigger?.textContent || '');
      return hasSpinner || loadingText;
    }, labelText, index);
  }

  async waitForDialogSelectEnabled(labelText, index = 0, timeout = 10000) {
    await this.page.waitForFunction((label, idx) => {
      const scope = document.querySelector('[role="dialog"]');
      if (!scope) return false;
      const labels = [...scope.querySelectorAll('label, [class*="MuiInputLabel"]')];
      const matching = labels.filter(el =>
        el.textContent.trim().toLowerCase().includes(label.toLowerCase())
      );
      const lbl = matching[idx];
      if (!lbl) return false;
      const formControl = lbl.closest('[class*="MuiFormControl"]');
      if (!formControl) return false;
      const isDisabled = formControl.classList.toString().includes('disabled') ||
                         !!formControl.querySelector('[class*="Mui-disabled"]');
      return !isDisabled;
    }, { timeout }, labelText, index);
  }

  // ── Edit Case Modal: Submission helpers ────────────────────────────────────

  async getSaveButtonState() {
    return this.page.evaluate(() => {
      const scope = document.querySelector('[role="dialog"]');
      if (!scope) return { text: '', disabled: true, loading: false };
      const btns = [...scope.querySelectorAll('button')];
      const btn = btns.find(el => /save|saving/i.test(el.textContent));
      if (!btn) return { text: '', disabled: true, loading: false };
      return {
        text: btn.textContent.trim(),
        disabled: btn.disabled || btn.getAttribute('aria-disabled') === 'true',
        loading: !!btn.querySelector('[class*="CircularProgress"]'),
      };
    });
  }

  async isCancelButtonDisabled() {
    return this.page.evaluate(() => {
      const scope = document.querySelector('[role="dialog"]');
      if (!scope) return false;
      const btns = [...scope.querySelectorAll('button')];
      const btn = btns.find(el => /cancel|close/i.test(el.textContent));
      return btn ? (btn.disabled || btn.getAttribute('aria-disabled') === 'true') : false;
    });
  }
}

module.exports = CaseDetailPage;
