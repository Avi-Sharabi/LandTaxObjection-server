'use strict';

const BasePage = require('./BasePage');

class CasesPage extends BasePage {
  async open() {
    await this.goto('/accountant/cases');
  }

  async waitForLoad(timeout = 45000) {
    // Same skeleton-row guard used in ClientsPage — MUI renders "0–0 of 0" during skeleton phase.
    // This same check doubles as an auth probe elsewhere (see cases.v2.test.js /
    // edit-case-modal.test.js) — it only resolves once the real case-list API call has
    // actually returned data, unlike a pathname check, which the app satisfies whether or
    // not the session is valid.
    await this.page.waitForFunction(
      () => {
        const paginationEl = document.querySelector('.MuiTablePagination-displayedRows');
        if (!paginationEl) return false;
        const pText = paginationEl.textContent.trim();
        const totalMatch = pText.match(/of\s*(\d+)/i);
        if (!totalMatch) return false;
        const total = parseInt(totalMatch[1]);

        if (total > 0) {
          const cells = [...document.querySelectorAll('tbody td')];
          return cells.some(td => td.textContent.trim().length > 0);
        }

        const rows = [...document.querySelectorAll('tbody tr')];
        return !rows.some(r => r.textContent.trim() === '');
      },
      { timeout }
    );
  }

  async search(term) {
    const selector = 'input[placeholder*="Search" i]';
    await this.page.waitForSelector(selector, { timeout: 10000 });
    await this.page.click(selector, { clickCount: 3 });
    await this.page.type(selector, term);
    await this.page.keyboard.press('Enter');
    const prev = await this.page.evaluate(() =>
      document.querySelector('.MuiTablePagination-displayedRows')?.textContent?.trim() || ''
    );
    await this.page.waitForFunction(
      (p) => document.querySelector('.MuiTablePagination-displayedRows')?.textContent?.trim() !== p,
      { timeout: 5000 },
      prev
    ).catch(() => {});
    await new Promise(r => setTimeout(r, 300));
  }

  async clearSearch() {
    const selector = 'input[placeholder*="Search" i]';
    await this.page.waitForSelector(selector, { timeout: 5000 }).catch(() => {});
    await this.page.click(selector, { clickCount: 3 });
    await this.page.keyboard.press('Backspace');
    await this.page.keyboard.press('Enter');
    const prev = await this.page.evaluate(() =>
      document.querySelector('.MuiTablePagination-displayedRows')?.textContent?.trim() || ''
    );
    await this.page.waitForFunction(
      (p) => document.querySelector('.MuiTablePagination-displayedRows')?.textContent?.trim() !== p,
      { timeout: 5000 },
      prev
    ).catch(() => {});
    await new Promise(r => setTimeout(r, 300));
  }

  // Works for both "Status" and "Jurisdiction" MUI Select filters.
  // MUI renders the listbox as a portal (ul[role="listbox"]) — must use real element click.
  async selectFilter(labelText, optionText) {
    const handle = await this.page.evaluateHandle((label) => {
      const roots = [...document.querySelectorAll('.MuiInputBase-root')];
      const match = roots.find(el =>
        el.textContent.toLowerCase().includes(label.toLowerCase())
      );
      if (!match) return null;
      return match.querySelector('[role="combobox"]') || match;
    }, labelText);

    const comboboxEl = handle.asElement();
    if (!comboboxEl) throw new Error(`Filter "${labelText}" not found`);

    await comboboxEl.click();

    try {
      await this.page.waitForSelector('ul[role="listbox"]', { timeout: 8000 });
    } catch (e) {
      await this.page.keyboard.press('Escape').catch(() => {});
      throw new Error(`Filter "${labelText}" listbox did not open`);
    }

    const picked = await this.page.evaluate((text) => {
      const options = [...document.querySelectorAll('ul[role="listbox"] li, [role="option"]')];
      const match = options.find(el =>
        el.textContent.trim().toLowerCase().includes(text.toLowerCase())
      );
      if (match) { match.click(); return true; }
      return false;
    }, optionText);

    if (!picked) {
      await this.page.keyboard.press('Escape').catch(() => {});
      throw new Error(`Option "${optionText}" not found in filter`);
    }
    await new Promise(r => setTimeout(r, 800));
  }

  async getRowCount() {
    return this.page.evaluate(() =>
      document.querySelectorAll('tbody tr:not([class*="head"])').length
    );
  }

  async getCountLabelText() {
    return this.page.evaluate(() => {
      const el = document.querySelector('.MuiTablePagination-displayedRows');
      return el?.textContent?.trim() || '';
    });
  }

  async isEmptyStateVisible() {
    return this.page.evaluate(() => {
      const label = document.querySelector('.MuiTablePagination-displayedRows');
      if (label && /^0/.test(label.textContent.trim())) return true;
      if (document.querySelectorAll('tbody td').length === 0) return true;
      if (document.querySelector('[class*="empty" i], [class*="noData" i], [class*="no-data" i]')) return true;
      if (/no cases found|no results found|no data/i.test(document.body.innerText)) return true;
      return false;
    });
  }

  async getAllRowTexts() {
    return this.page.evaluate(() => {
      const rows = [...document.querySelectorAll('tbody tr:not([class*="head"])')];
      return rows.map(row => row.textContent?.trim().toLowerCase() || '');
    });
  }

  async getRowTextForCase(caseRef) {
    return this.page.evaluate((ref) => {
      const rows = [...document.querySelectorAll('tbody tr')];
      const row = rows.find(r => r.textContent.includes(ref));
      return row?.textContent?.trim() || null;
    }, caseRef);
  }

  // The "Valuated" column renders a MUI CheckCircle icon (data-testid="CheckCircleIcon")
  // when either the transient AI-queue status is "completed" OR row.is_valuated is true.
  async isValuatedForCase(caseRef) {
    return this.page.evaluate((ref) => {
      const rows = [...document.querySelectorAll('tbody tr')];
      const row = rows.find(r => r.textContent.includes(ref));
      if (!row) return null;
      return !!row.querySelector('svg[data-testid="CheckCircleIcon"]');
    }, caseRef);
  }

  // Clicks the first action icon (eye/view) in the row for the given case reference.
  // The MUI icon buttons carry no aria-label in this app — the reliable selector is the
  // inner <svg data-testid="VisibilityIcon">, not text/aria attributes. Falls back to
  // "first button in row" (view is always leftmost) if the icon's testid ever changes.
  async clickEyeIconForCase(caseRef) {
    const clicked = await this.page.evaluate((ref) => {
      const rows = [...document.querySelectorAll('tbody tr')];
      const dataRows = rows.filter(r => r.querySelector('td'));
      const row = dataRows.find(r => r.textContent.includes(ref));
      if (!row) return false;

      const viewIcon = row.querySelector('svg[data-testid="VisibilityIcon"]');
      if (viewIcon) { viewIcon.closest('button, a').click(); return true; }

      const viewBtn = row.querySelector(
        '[aria-label*="view" i], [aria-label*="eye" i], [data-testid*="view"]'
      );
      if (viewBtn) { viewBtn.click(); return true; }

      // First button in the action column (view comes before edit/delete)
      const btns = [...row.querySelectorAll('button, a')];
      if (btns.length > 0) { btns[0].click(); return true; }

      row.click();
      return true;
    }, caseRef);

    if (!clicked) throw new Error(`Row not found for case: ${caseRef}`);

    await this.page.waitForFunction(
      () => window.location.pathname.includes('/cases/') &&
            !window.location.pathname.endsWith('/cases'),
      { timeout: 15000 }
    );
  }

  // Clicks the edit (pencil) action icon in the row for the given case reference.
  // Matched by the Edit icon's SVG path since row action order is [View, Edit, Delete].
  async clickPencilIconForCase(caseRef) {
    const clicked = await this.page.evaluate((ref) => {
      const rows = [...document.querySelectorAll('tbody tr')];
      const dataRows = rows.filter(r => r.querySelector('td'));
      const row = dataRows.find(r => r.textContent.includes(ref));
      if (!row) return false;

      const editIcon = row.querySelector('svg[data-testid="EditIcon"]');
      if (editIcon) { editIcon.closest('button, a').click(); return true; }

      const editBtn = row.querySelector(
        '[aria-label*="edit" i], [aria-label*="pencil" i], [data-testid*="edit"]'
      );
      if (editBtn) { editBtn.click(); return true; }

      // Action column order is [View, Edit, Delete] — the edit icon is the SECOND
      // button, not the last (the last is Delete). It's hidden while AI analysis
      // is in progress, in which case only the View button renders.
      const btns = [...row.querySelectorAll('button, a')];
      if (btns.length < 2) return false;
      btns[1].click();
      return true;
    }, caseRef);

    if (!clicked) throw new Error(`Trash icon not found for case: ${caseRef}`);
    await new Promise(r => setTimeout(r, 800));
  }

  // Clicks the delete (trash) action icon in the row for the given case reference.
  // Matched by the Delete icon's data-testid since row action order is [View, Edit, Delete].
  async clickTrashIconForCase(caseRef) {
    const clicked = await this.page.evaluate((ref) => {
      const rows = [...document.querySelectorAll('tbody tr')];
      const dataRows = rows.filter(r => r.querySelector('td'));
      const row = dataRows.find(r => r.textContent.includes(ref));
      if (!row) return false;

      const deleteIcon = row.querySelector('svg[data-testid="DeleteIcon"]');
      if (deleteIcon) { deleteIcon.closest('button, a').click(); return true; }

      const deleteBtn = row.querySelector(
        '[aria-label*="delete" i], [aria-label*="trash" i], [data-testid*="delete"]'
      );
      if (deleteBtn) { deleteBtn.click(); return true; }

      // Action column order is [View, Edit, Delete] — delete is the last button.
      const btns = [...row.querySelectorAll('button, a')];
      if (btns.length === 0) return false;
      btns[btns.length - 1].click();
      return true;
    }, caseRef);

    if (!clicked) throw new Error(`Trash icon not found for case: ${caseRef}`);
    await new Promise(r => setTimeout(r, 600));
  }

  // ── Generic dialog helpers (Edit Case / Delete Case confirmation) ─────────────

  async isDialogOpen() {
    return this.page.evaluate(() => !!document.querySelector('[role="dialog"]'));
  }

  async getDialogTitle() {
    return this.page.evaluate(() => {
      const scope = document.querySelector('[role="dialog"]');
      const el = scope?.querySelector('h1, h2, h3, [class*="MuiDialogTitle"]');
      return el?.textContent?.trim() || '';
    });
  }

  async getDialogText() {
    return this.page.evaluate(() =>
      document.querySelector('[role="dialog"]')?.innerText?.trim() || ''
    );
  }

  // Clicks "Cancel" inside the open dialog — used to close both the Edit Case modal
  // and the Delete Case confirmation without saving/deleting anything.
  async cancelDialog() {
    const clicked = await this.page.evaluate(() => {
      const scope = document.querySelector('[role="dialog"]');
      if (!scope) return false;
      const btns = [...scope.querySelectorAll('button, [role="button"]')];
      const btn = btns.find(el => /cancel|close/i.test(el.textContent.trim()));
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!clicked) throw new Error('Cancel button not found in dialog');
    await new Promise(r => setTimeout(r, 600));
  }

  async clickNewCase() {
    const prevUrl = await this.currentUrl();

    const handle = await this.page.evaluateHandle(() => {
      const btns = [...document.querySelectorAll('button, [role="button"], a')];
      return btns.find(el => /new case/i.test(el.textContent)) || null;
    });
    const btnEl = handle.asElement();
    if (!btnEl) throw new Error('"New Case" button not found');
    await btnEl.click();

    await this.page.waitForFunction(
      (prev) => {
        if (window.location.href !== prev) return true;
        if (document.querySelector('[class*="MuiDrawer-paperAnchorRight"], [class*="anchorRight"]')) return true;
        if (document.querySelector('[role="dialog"]')) return true;
        const inputs = [...document.querySelectorAll('input')].filter(
          el => !el.placeholder?.toLowerCase().includes('search') &&
                !el.classList.toString().includes('nativeInput') &&
                el.type !== 'hidden'
        );
        return inputs.length > 0;
      },
      { timeout: 12000 },
      prevUrl
    ).catch(() => {});

    await new Promise(r => setTimeout(r, 500));
  }

  async fillNewCaseForm(fields) {
    await this.page.evaluate((f) => {
      const getInput = (labelSubstr) => {
        const container = document.querySelector('[role="dialog"], [class*="Drawer" i], main');
        const scope = container || document;
        const labels = [...scope.querySelectorAll('label, [class*="MuiInputLabel"]')];
        const lbl = labels.find(el =>
          el.textContent.trim().toLowerCase().includes(labelSubstr.toLowerCase())
        );
        if (lbl?.htmlFor) return document.getElementById(lbl.htmlFor);
        return scope.querySelector(`input[placeholder*="${labelSubstr}" i]`) ||
               scope.querySelector(`input[name*="${labelSubstr}" i]`);
      };
      const setVal = (input, value) => {
        if (!input) return;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      if (f.assessedValue !== undefined) setVal(getInput('assessed') || getInput('value'), f.assessedValue);
      if (f.notes         !== undefined) setVal(getInput('notes'), f.notes);
      if (f.deadline      !== undefined) setVal(getInput('deadline') || getInput('date'), f.deadline);
    }, fields);
    await new Promise(r => setTimeout(r, 300));
  }

  async submitForm() {
    const clicked = await this.page.evaluate(() => {
      const allBtns = [...document.querySelectorAll('button')];
      const formBtns = allBtns.filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.left > 200;
      });
      const match = formBtns.find(el =>
        /save|submit|create|add|confirm/i.test(el.textContent) && !el.disabled
      );
      if (match) { match.click(); return { found: true, text: match.textContent.trim() }; }
      const submitBtn = document.querySelector('button[type="submit"]:not(:disabled)');
      if (submitBtn) { submitBtn.click(); return { found: true, text: submitBtn.textContent.trim() }; }
      return { found: false, allTexts: allBtns.map(b => b.textContent.trim().slice(0, 40)).filter(Boolean) };
    });

    if (!clicked.found) {
      throw new Error(`Submit button not found. Visible buttons: [${(clicked.allTexts || []).join(', ')}]`);
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  async cancelForm() {
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
        '.MuiFormHelperText-root, [class*="error" i], [role="alert"]'
      )];
      return errors.map(el => el.textContent?.trim()).filter(Boolean);
    });
  }

  async clickNextPage() {
    const clicked = await this.page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Go to next page"]') ||
                  document.querySelector('button[title="Go to next page"]');
      if (btn && !btn.disabled) { btn.click(); return true; }
      return false;
    });
    if (!clicked) throw new Error('Next page button not found or disabled');
    await new Promise(r => setTimeout(r, 800));
  }

  async clickPrevPage() {
    await this.page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Go to previous page"]') ||
                  document.querySelector('button[title="Go to previous page"]');
      if (btn && !btn.disabled) btn.click();
    });
    await new Promise(r => setTimeout(r, 800));
  }

  async isPrevPageDisabled() {
    return this.page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Go to previous page"]') ||
                  document.querySelector('button[title="Go to previous page"]');
      return btn ? btn.disabled : true;
    });
  }

  async isNextPageDisabled() {
    return this.page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Go to next page"]') ||
                  document.querySelector('button[title="Go to next page"]');
      return btn ? btn.disabled : true;
    });
  }

  async setRowsPerPage(count) {
    const changed = await this.page.evaluate(() => {
      const paginationRoot = document.querySelector('.MuiTablePagination-root');
      if (!paginationRoot) return false;
      const selectRoot = paginationRoot.querySelector('.MuiSelect-select, [role="combobox"]');
      if (selectRoot) { selectRoot.click(); return 'opened'; }
      return false;
    });

    if (!changed) return;

    await new Promise(r => setTimeout(r, 400));
    await this.page.evaluate((n) => {
      const options = [...document.querySelectorAll(
        'ul[role="listbox"] li, [role="listbox"] [role="option"], [role="option"]'
      )];
      const match = options.find(el => el.textContent.trim() === String(n));
      if (match) match.click();
    }, count);
    await new Promise(r => setTimeout(r, 800));
  }

  async clickSidebarLink(linkText) {
    const clicked = await this.page.evaluate((text) => {
      const allEls = [...document.querySelectorAll('a, button, li, [role="menuitem"], [role="button"], div[tabindex]')];
      const leftEls = allEls.filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.left < 350 && rect.width > 10 && rect.height > 10;
      });
      const byText = (els) => els.find(el =>
        el.textContent.trim().toLowerCase() === text.toLowerCase() ||
        el.textContent.trim().toLowerCase().startsWith(text.toLowerCase())
      );
      const match = byText(leftEls) || byText(allEls);
      if (match) { match.click(); return true; }
      return false;
    }, linkText);
    if (!clicked) throw new Error(`Sidebar link "${linkText}" not found`);
    await new Promise(r => setTimeout(r, 1200));
  }
}

module.exports = CasesPage;
