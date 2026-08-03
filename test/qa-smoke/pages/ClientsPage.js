'use strict';

const BasePage = require('./BasePage');

class ClientsPage extends BasePage {
  async open() {
    await this.goto('/accountant/client');
  }

  async waitForLoad(timeout = 30000) {
    // MUI table initially renders skeleton rows (empty text) while loading, and pagination
    // shows "0–0 of 0". We must not resolve on that state.
    //
    // Resolution conditions:
    //   total > 0  → at least one tbody td has non-empty text content
    //   total = 0  → no tbody row has empty text (skeletons cleared, genuine no-results)
    //
    // This same check doubles as an auth probe elsewhere (see clients.test.js) — it only
    // resolves once the real client-list API call has actually returned data, unlike a
    // pathname check, which the app satisfies whether or not the session is valid.
    await this.page.waitForFunction(
      () => {
        const paginationEl = document.querySelector('.MuiTablePagination-displayedRows');
        if (!paginationEl) return false;
        const pText = paginationEl.textContent.trim();
        // Extract total count from "N–M of T" / "N-M of T" / "of T" variants
        const totalMatch = pText.match(/of\s*(\d+)/i);
        if (!totalMatch) return false;
        const total = parseInt(totalMatch[1]);

        if (total > 0) {
          // Skeleton cells have empty textContent; wait for at least one cell with real text
          const cells = [...document.querySelectorAll('tbody td')];
          return cells.some(td => td.textContent.trim().length > 0);
        }

        // total = 0: either genuine empty result or still loading
        // Skeleton rows have empty textContent — wait until none remain
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
    // Press Enter — some MUI search fields only trigger on Enter, not on type debounce
    await this.page.keyboard.press('Enter');
    // Wait for pagination to change, or fall back after 5s
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
    // Wait for results to restore, fall back after 5s
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

  // Click a MUI Select filter by its label text, then pick an option.
  // MUI renders the listbox as a portal (ul[role="listbox"]).
  // Uses Puppeteer's real element click (synthetic .click() doesn't trigger MUI's mousedown handler).
  async selectFilter(labelText, optionText) {
    // Get a real element handle for the combobox inside the matching MuiInputBase-root
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

    // Puppeteer real click — triggers MUI's mousedown → open sequence
    await comboboxEl.click();

    // Wait for portal listbox to appear
    try {
      await this.page.waitForSelector('ul[role="listbox"]', { timeout: 8000 });
    } catch (e) {
      // Dismiss any open overlay and rethrow
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

  // Count only data rows (rows with <td>, not the MuiTableRow-head header row)
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
      // 1. Pagination shows 0 rows
      const label = document.querySelector('.MuiTablePagination-displayedRows');
      if (label && /^0/.test(label.textContent.trim())) return true;
      // 2. No data cells at all
      if (document.querySelectorAll('tbody td').length === 0) return true;
      // 3. Explicit empty state element
      if (document.querySelector('[class*="empty" i], [class*="noData" i], [class*="no-data" i]')) return true;
      // 4. Known empty text
      if (/no clients found|no results found|no data/i.test(document.body.innerText)) return true;
      return false;
    });
  }

  async getVisibleClientNames() {
    return this.page.evaluate(() => {
      const rows = [...document.querySelectorAll('tbody tr:not([class*="head"])')];
      return rows.map(row => row.querySelector('td')?.textContent?.trim() || '');
    });
  }

  async getAllRowTexts() {
    return this.page.evaluate(() => {
      const rows = [...document.querySelectorAll('tbody tr:not([class*="head"])')];
      return rows.map(row => row.textContent?.trim().toLowerCase() || '');
    });
  }

  // Navigate to a client's detail page by clicking their row.
  // The table has an onClick on <tr> that navigates to the detail route.
  async clickRowEyeIcon(clientNameContains) {
    const clicked = await this.page.evaluate((name) => {
      const rows = [...document.querySelectorAll('tbody tr')];
      // Only data rows (containing <td>, not <th>)
      const dataRows = rows.filter(r => r.querySelector('td'));
      const row = dataRows.find(r =>
        r.textContent.toLowerCase().includes(name.toLowerCase())
      );
      if (!row) return false;

      // Priority 1: specific aria-label or href link
      const link = row.querySelector('[aria-label*="view" i], a[href*="/client/"], [data-testid*="view"]');
      if (link) { link.click(); return true; }

      // Priority 2: last button or link in the row (action column)
      const interactive = [...row.querySelectorAll('button, a')];
      const last = interactive[interactive.length - 1];
      if (last) { last.click(); return true; }

      // Priority 3: click the row itself (table has row-level onClick handler)
      row.click();
      return true;
    }, clientNameContains);

    if (!clicked) throw new Error(`Row not found for client: ${clientNameContains}`);

    await this.page.waitForFunction(
      () => window.location.pathname.includes('/client/') &&
            window.location.pathname !== '/accountant/client',
      { timeout: 15000 }
    );
  }

  async clickNewClient() {
    const prevUrl = await this.currentUrl();

    // Use a real Puppeteer click — synthetic .click() via evaluate doesn't trigger React handlers
    const handle = await this.page.evaluateHandle(() => {
      const btns = [...document.querySelectorAll('button, [role="button"], a')];
      return btns.find(el => /new client/i.test(el.textContent)) || null;
    });
    const btnEl = handle.asElement();
    if (!btnEl) throw new Error('"New Client" button not found');
    await btnEl.click();

    // Wait for: page navigation, a right-side form drawer, a dialog, or new inputs
    await this.page.waitForFunction(
      (prev) => {
        if (window.location.href !== prev) return true;
        // Right-side drawer (form panel)
        if (document.querySelector('[class*="MuiDrawer-paperAnchorRight"], [class*="anchorRight"]')) return true;
        // Any dialog
        if (document.querySelector('[role="dialog"]')) return true;
        // New form inputs (non-search, non-select-native)
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

  async fillNewClientForm(fields) {
    await this.page.evaluate((f) => {
      const getInput = (labelSubstr) => {
        // Search in dialog/drawer first
        const container = document.querySelector('[role="dialog"], [class*="Drawer" i], main');
        const scope = container || document;
        // By label association
        const labels = [...scope.querySelectorAll('label, [class*="MuiInputLabel"]')];
        const lbl = labels.find(el => el.textContent.trim().toLowerCase().includes(labelSubstr.toLowerCase()));
        if (lbl?.htmlFor) return document.getElementById(lbl.htmlFor);
        // By placeholder
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
      if (f.name  !== undefined) setVal(getInput('name') || getInput('full name'), f.name);
      if (f.email !== undefined) setVal(getInput('email'), f.email);
      if (f.phone !== undefined) setVal(getInput('phone'), f.phone);
    }, fields);
    await new Promise(r => setTimeout(r, 300));
  }

  async submitNewClientForm() {
    const clicked = await this.page.evaluate(() => {
      // Look broadly — form may be in right-side drawer, dialog, or directly on page
      // Exclude sidebar nav buttons (left-positioned)
      const allBtns = [...document.querySelectorAll('button')];
      const formBtns = allBtns.filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.left > 200; // exclude left-sidebar area
      });

      const match = formBtns.find(el =>
        /save|submit|create|add|confirm/i.test(el.textContent) && !el.disabled
      );
      if (match) { match.click(); return { found: true, text: match.textContent.trim() }; }

      // Fallback: type=submit anywhere
      const submitBtn = document.querySelector('button[type="submit"]:not(:disabled)');
      if (submitBtn) { submitBtn.click(); return { found: true, text: submitBtn.textContent.trim() }; }

      // Debug: list all visible button texts
      return { found: false, allTexts: allBtns.map(b => b.textContent.trim().slice(0,40)).filter(Boolean) };
    });

    if (!clicked.found) {
      throw new Error(`Submit button not found. Visible buttons: [${(clicked.allTexts || []).join(', ')}]`);
    }
    await new Promise(r => setTimeout(r, 1500));
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
    // MUI TablePagination uses a MUI Select (not native <select>) for rows per page
    const changed = await this.page.evaluate((n) => {
      // Try clicking the MUI Select in the pagination area
      const paginationRoot = document.querySelector('.MuiTablePagination-root');
      if (!paginationRoot) return false;
      const selectRoot = paginationRoot.querySelector('.MuiSelect-select, [role="combobox"]');
      if (selectRoot) { selectRoot.click(); return 'opened'; }
      return false;
    }, count);

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
      // The sidebar nav items may not be <a> tags — search all clickable elements by text
      const allEls = [...document.querySelectorAll('a, button, li, [role="menuitem"], [role="button"], div[tabindex]')];
      // Prefer left-positioned elements (sidebar is on the left)
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

module.exports = ClientsPage;
