'use strict';

const BasePage = require('./BasePage');

// Row action icons render with no aria-label — same MUI Delete icon path confirmed via
// helpers/inspect-delete-case.js against the live Cases tab (which renders only View + Delete,
// no Edit and no row-selection checkbox — see TC-DEL-018).
const DELETE_ICON_PATH = 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6';

class ClientDetailPage extends BasePage {
  async waitForLoad() {
    await this.page.waitForFunction(
      () => window.location.pathname.match(/\/client\/[a-z0-9-]+/) !== null,
      { timeout: 15000 }
    );
    // Wait for the client card's action button (Edit Client / Activate Client) which
    // loads async from a second API call — NOT just the page shell tabs/heading. Bumped
    // from 20000 to 30000: this specific gate recurred as a timeout across multiple live
    // runs while every purely-structural check on this page passed reliably, consistent
    // with clickTab's own documented "staging slows under load" 20s bump elsewhere in
    // this suite.
    await this.page.waitForFunction(
      () => {
        const btns = [...document.querySelectorAll('button')];
        return btns.some(el =>
          /edit client|activate client/i.test(el.innerText || el.textContent || '')
        );
      },
      { timeout: 30000 }
    );
  }

  async getHeaderText() {
    return this.page.evaluate(() => {
      const h = document.querySelector('h1,h2,h3,h4,h5,h6');
      return h?.textContent?.trim() || '';
    });
  }

  async getStatusBadgeText() {
    return this.page.evaluate(() => {
      // The status chip uses MuiChip-filled (vs role chip which uses MuiChip-outlined).
      // [class*="badge"] and [class*="status"] also match the notification badge showing "0",
      // so target the filled chip's label specifically.
      const label = document.querySelector('[class*="MuiChip-filled"] [class*="MuiChip-label"]');
      if (label) return label.textContent.trim();
      // Fallback: look for a chip whose text is a known status
      const chips = [...document.querySelectorAll('[class*="MuiChip"]')];
      const statusChip = chips.find(el =>
        /^(prospect|active|inactive|suspended)$/i.test(el.textContent.trim())
      );
      return statusChip?.textContent?.trim() || '';
    });
  }

  async getMetaFieldValue(fieldLabel) {
    return this.page.evaluate((label) => {
      const allEls = [...document.querySelectorAll('*')];
      const labelEl = allEls.find(el =>
        el.children.length === 0 &&
        el.textContent.trim().toLowerCase().includes(label.toLowerCase())
      );
      if (!labelEl) return null;
      // Try next sibling, parent's next sibling, or nearby text
      const container = labelEl.closest('[class*="grid" i], [class*="row" i], li, div');
      const text = container?.textContent?.replace(labelEl.textContent, '').trim();
      return text || null;
    }, fieldLabel);
  }

  async getTabNames() {
    return this.page.evaluate(() =>
      [...document.querySelectorAll('[role="tab"]')].map(el => el.textContent?.trim())
    );
  }
// test terst test
  async clickTab(tabName) {
    // Tabs can mount slightly after waitForLoad() resolves (waitForLoad only
    // requires a heading OR tabs, not both) — poll instead of checking once.
    // 20s (not 10s) because under a full-suite run the staging deployment has
    // already absorbed many prior logins/API calls and can be slower to
    // populate secondary tabs than it is on a standalone run.
    await this.page.waitForFunction(
      (name) => [...document.querySelectorAll('[role="tab"]')]
        .some(el => el.textContent.trim().toLowerCase().includes(name.toLowerCase())),
      { timeout: 20000 },
      tabName
    ).catch(async () => {
      const debugInfo = await this.page.evaluate(() => ({
        url: window.location.href,
        tabsFound: [...document.querySelectorAll('[role="tab"]')].map(el => el.textContent?.trim()),
        heading: document.querySelector('h1,h2,h3,h4,h5,h6')?.textContent?.trim() || null,
        bodyErrorText: document.querySelector('[class*="error" i], [role="alert"]')?.textContent?.trim() || null,
      })).catch(() => null);
      throw new Error(`Tab "${tabName}" not found after 20s. Page state: ${JSON.stringify(debugInfo)}`);
    });
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

  async getTabPanelText() {
    return this.page.evaluate(() => {
      const panel = document.querySelector('[role="tabpanel"], [class*="tabpanel" i], [class*="TabPanel" i]');
      return panel?.textContent?.trim() || document.querySelector('main')?.textContent?.trim() || '';
    });
  }

  async getSectionFieldValue(sectionHeading, fieldLabel) {
    return this.page.evaluate((section, field) => {
      // Find the section heading
      const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,div')];
      const sectionEl = headings.find(el =>
        el.children.length === 0 && el.textContent.trim().toLowerCase() === section.toLowerCase()
      );
      if (!sectionEl) return null;
      const container = sectionEl.closest('section, [class*="section" i], [class*="card" i], div');
      if (!container) return null;
      // Find field label within this section
      const fieldEls = [...container.querySelectorAll('*')];
      const labelEl = fieldEls.find(el =>
        el.children.length === 0 && el.textContent.trim().toLowerCase().includes(field.toLowerCase())
      );
      if (!labelEl) return null;
      const row = labelEl.closest('[class*="row" i], li, div');
      return row?.textContent?.replace(labelEl.textContent, '').trim() || null;
    }, sectionHeading, fieldLabel);
  }

  // Returns true if the section has no "null" or "undefined" text
  async sectionHasNoNullValues(sectionHeading) {
    return this.page.evaluate((section) => {
      const headings = [...document.querySelectorAll('*')];
      const sectionEl = headings.find(el =>
        el.children.length === 0 && el.textContent.trim().toLowerCase() === section.toLowerCase()
      );
      if (!sectionEl) return true; // section not found — can't check
      const container = sectionEl.closest('section, [class*="section" i], [class*="card" i], div');
      if (!container) return true;
      return !/\bnull\b|\bundefined\b/i.test(container.textContent);
    }, sectionHeading);
  }

  async clickBackToClients() {
    // Wait for the button to render (detail page may not be fully loaded yet when called)
    await this.page.waitForFunction(
      () => {
        const els = [...document.querySelectorAll('a, button, [role="button"]')];
        return els.some(el => /back to clients/i.test(el.textContent));
      },
      { timeout: 10000 }
    );
    const handle = await this.page.evaluateHandle(() => {
      const els = [...document.querySelectorAll('a, button, [role="button"]')];
      return els.find(el => /back to clients/i.test(el.textContent)) || null;
    });
    const btnEl = handle.asElement();
    if (!btnEl) throw new Error('"Back to Clients" link not found');
    await btnEl.click();
    await this.page.waitForFunction(
      () => window.location.pathname === '/accountant/client' ||
             window.location.pathname.endsWith('/client'),
      { timeout: 15000 }
    );
  }

  // Returns true if the edit form opened successfully, false if it did not open.
  // The form is non-functional on the current staging deployment (known app bug).
  async clickEditClient() {
    // waitForLoad() already waits for the button, but when clickEditClient() is called
    // directly inside a test (e.g. re-opening the modal) we add a short safety wait.
    await this.page.waitForFunction(
      () => {
        const btns = [...document.querySelectorAll('button')];
        return btns.some(el =>
          /edit client/i.test(el.innerText || el.textContent || '')
        );
      },
      { timeout: 15000 }
    ).catch(() => {});

    const rect = await this.page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const btn = btns.find(el =>
        /edit client/i.test(el.innerText || el.textContent || '')
      );
      if (!btn) return null;
      btn.scrollIntoView({ behavior: 'instant', block: 'center' });
      const r = btn.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!rect) throw new Error('"Edit Client" button not found');
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
    // Wait up to 3s for values to populate via async API pre-fill
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
      const getInput = (label) => {
        const labels = [...document.querySelectorAll('label, [class*="MuiInputLabel"]')];
        const lbl = labels.find(el => el.textContent.trim().toLowerCase().includes(label.toLowerCase()));
        if (lbl?.htmlFor) return document.getElementById(lbl.htmlFor);
        return document.querySelector(`input[placeholder*="${label}" i], input[name*="${label}" i]`);
      };
      const setVal = (input, value) => {
        if (!input) return;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      if (f.fullName !== undefined) setVal(getInput('full name') || getInput('name'), f.fullName);
      if (f.email   !== undefined) setVal(getInput('email'), f.email);
      if (f.phone   !== undefined) setVal(getInput('phone'), f.phone);
    }, fields);
    await new Promise(r => setTimeout(r, 300));
  }

  async clearEditField(fieldLabel) {
    await this.page.evaluate((label) => {
      const labels = [...document.querySelectorAll('label, [class*="MuiInputLabel"]')];
      const lbl = labels.find(el => el.textContent.trim().toLowerCase().includes(label.toLowerCase()));
      const input = lbl?.htmlFor
        ? document.getElementById(lbl.htmlFor)
        : document.querySelector(`input[name*="${label}" i]`);
      if (!input) return;
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, fieldLabel);
  }

  async submitEditForm() {
    // Use real Puppeteer click — form save buttons need native events
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
    if (!btnEl) throw new Error('Cancel button not found in edit form');
    await btnEl.click();
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

  async isActivateClientButtonVisible() {
    return this.page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, [role="button"]')];
      const btn = btns.find(el => /activate client/i.test(el.textContent));
      return !!btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true';
    });
  }

  async clickActivateClient() {
    const handle = await this.page.evaluateHandle(() => {
      const btns = [...document.querySelectorAll('button, [role="button"]')];
      return btns.find(el => /activate client/i.test(el.textContent)) || null;
    });
    const btnEl = handle.asElement();
    if (!btnEl) throw new Error('"Activate Client" button not found');
    await btnEl.click();
    // Wait for confirmation dialog to appear
    await this.page.waitForFunction(
      () => !!document.querySelector('[role="dialog"]'),
      { timeout: 8000 }
    ).catch(() => {});
    await new Promise(r => setTimeout(r, 400));
  }

  async confirmActivation() {
    await new Promise(r => setTimeout(r, 500)); // let dialog buttons fully render
    const rect = await this.page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const scope = dialog || document;
      const btns = [...scope.querySelectorAll('button, [role="button"]')];
      const btn = btns.find(el => /confirm|yes|activate|ok|proceed|accept/i.test(el.textContent.trim()));
      if (!btn) return null;
      btn.scrollIntoView({ behavior: 'instant', block: 'center' });
      const r = btn.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!rect) throw new Error('Confirmation button not found');
    await this.page.mouse.click(rect.x, rect.y);
    await new Promise(r => setTimeout(r, 3000)); // staging API may take >1.5s to persist
  }

  async cancelActivation() {
    const handle = await this.page.evaluateHandle(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const scope = dialog || document;
      const btns = [...scope.querySelectorAll('button, [role="button"]')];
      return btns.find(el => /cancel|no/i.test(el.textContent.trim())) ||
             [...document.querySelectorAll('button')].find(el => /^(cancel|no)$/i.test(el.textContent.trim())) ||
             null;
    });
    const btnEl = handle.asElement();
    if (!btnEl) throw new Error('Cancel button in confirmation dialog not found');
    await btnEl.click();
    await new Promise(r => setTimeout(r, 600));
  }

  async isDialogVisible() {
    return this.page.evaluate(() => !!document.querySelector('[role="dialog"]'));
  }

  // Checks entire page body for "null" or "undefined" text (loose check)
  async pageHasNoNullValues() {
    return this.page.evaluate(() => !/\bnull\b|\bundefined\b/i.test(document.body.innerText));
  }

  async getSuccessMessage() {
    return this.page.evaluate(() => {
      const alert = document.querySelector(
        '[class*="MuiAlert"], [role="alert"], [class*="toast" i], [class*="snack" i]'
      );
      return alert?.textContent?.trim() || '';
    });
  }

  // ── Edit Client Modal: State inspection ────────────────────────────────────

  async isEditModalOpen() {
    return this.page.evaluate(() => !!document.querySelector('[role="dialog"]'));
  }

  async getEditModalTitle() {
    return this.page.evaluate(() => {
      const el = document.querySelector('[role="dialog"] h2, [role="dialog"] [class*="MuiDialogTitle"]');
      return el?.textContent?.trim() || '';
    });
  }

  async getEditModalSectionHeaders() {
    return this.page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return [];
      const headings = [...dialog.querySelectorAll(
        'h3,h4,h5,h6,[class*="MuiTypography-subtitle"],[class*="MuiTypography-h6"],[class*="section-title"],[class*="sectionTitle"]'
      )];
      return headings.map(el => el.textContent.trim()).filter(Boolean);
    });
  }

  async clickBackdrop() {
    // Click directly on the MUI backdrop overlay element — avoids hitting sidebar/nav at (10,10)
    await this.page.evaluate(() => {
      const backdrop = document.querySelector(
        '[class*="MuiBackdrop-root"], [class*="MuiModal-backdrop"], [class*="MuiBackdrop"]'
      );
      backdrop?.click();
    });
    await new Promise(r => setTimeout(r, 400));
  }

  // ── Edit Client Modal: MUI Select helpers ──────────────────────────────────
  // index selects the Nth matching label (0-based) — use 1 for postal section fields
  // that share the same label as home section fields (State, City, Postcode).

  async openDialogSelect(labelText, index = 0) {
    // Get the trigger's screen coordinates, then use page.mouse.click() so MUI
    // receives a trusted pointer event (element.click() in evaluate fires an
    // untrusted event that some MUI versions silently ignore).
    const coords = await this.page.evaluate((label, idx) => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return null;
      const labels = [...dialog.querySelectorAll('label, [class*="MuiInputLabel"]')];
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
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return '';
      const labels = [...dialog.querySelectorAll('label, [class*="MuiInputLabel"]')];
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

  // ── Edit Client Modal: Text input helpers ──────────────────────────────────

  async getDialogInputValue(labelText, index = 0) {
    return this.page.evaluate((label, idx) => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return '';
      const labels = [...dialog.querySelectorAll('label, [class*="MuiInputLabel"]')];
      const matching = labels.filter(el =>
        el.textContent.trim().toLowerCase().includes(label.toLowerCase())
      );
      const lbl = matching[idx];
      if (!lbl) return '';
      const input = lbl.htmlFor
        ? document.getElementById(lbl.htmlFor)
        : lbl.closest('[class*="MuiFormControl"]')?.querySelector('input');
      return input?.value ?? '';
    }, labelText, index);
  }

  async isDialogInputReadonly(labelText, index = 0) {
    return this.page.evaluate((label, idx) => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      const labels = [...dialog.querySelectorAll('label, [class*="MuiInputLabel"]')];
      const matching = labels.filter(el =>
        el.textContent.trim().toLowerCase().includes(label.toLowerCase())
      );
      const lbl = matching[idx];
      if (!lbl) return false;
      const input = lbl.htmlFor
        ? document.getElementById(lbl.htmlFor)
        : lbl.closest('[class*="MuiFormControl"]')?.querySelector('input');
      return input ? (input.readOnly || input.getAttribute('readonly') !== null) : false;
    }, labelText, index);
  }

  async getDialogFieldHelperText(labelText, index = 0) {
    return this.page.evaluate((label, idx) => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return '';
      const labels = [...dialog.querySelectorAll('label, [class*="MuiInputLabel"]')];
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

  // ── Edit Client Modal: Select state/loading helpers ────────────────────────

  async isDialogSelectDisabled(labelText, index = 0) {
    return this.page.evaluate((label, idx) => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      const labels = [...dialog.querySelectorAll('label, [class*="MuiInputLabel"]')];
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
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      const labels = [...dialog.querySelectorAll('label, [class*="MuiInputLabel"]')];
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
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      const labels = [...dialog.querySelectorAll('label, [class*="MuiInputLabel"]')];
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

  // ── Edit Client Modal: Postal Address helpers ──────────────────────────────

  async isSameAsHomeChecked() {
    return this.page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const checkbox = dialog?.querySelector('input[type="checkbox"]');
      return checkbox?.checked ?? false;
    });
  }

  async clickSameAsHome() {
    const clicked = await this.page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const checkbox = dialog?.querySelector('input[type="checkbox"]');
      if (!checkbox) return false;
      const wrapper = checkbox.closest('[class*="MuiCheckbox"], label') || checkbox;
      wrapper.click();
      return true;
    });
    if (!clicked) throw new Error('"Same as home address" checkbox not found');
    await new Promise(r => setTimeout(r, 400));
  }

  async arePostalFieldsVisible() {
    return this.page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      // When "Same as home" is checked the postal State/City/Postcode fields are removed.
      // A second "State" label only exists when postal fields are visible.
      const allLabels = [...dialog.querySelectorAll('label, [class*="MuiInputLabel"]')];
      const stateLabels = allLabels.filter(el => {
        const txt = el.textContent.trim().toLowerCase().replace(/\s*\*\s*$/, '');
        return txt === 'state';
      });
      if (stateLabels.length >= 2) return true;

      // Fallback: look for visible inputs/selects after the "Postal Address" heading
      const allEls = [...dialog.querySelectorAll('*')];
      const postalHeading = allEls.find(el =>
        el.children.length === 0 && /postal address/i.test(el.textContent)
      );
      if (!postalHeading) return false;
      let node = postalHeading.parentElement;
      while (node && node !== dialog) {
        const sibling = node.nextElementSibling;
        if (sibling) {
          const inputs = [...sibling.querySelectorAll(
            'input:not([type="hidden"]):not([type="checkbox"]), [class*="MuiSelect-select"]'
          )];
          if (inputs.some(el => {
            const s = window.getComputedStyle(el);
            return s.display !== 'none' && s.visibility !== 'hidden';
          })) return true;
        }
        node = node.parentElement;
      }
      return false;
    });
  }

  async getPostalHintText() {
    return this.page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return '';
      const allEls = [...dialog.querySelectorAll('em, i, [class*="italic"], p, span')];
      const hint = allEls.find(el =>
        el.children.length === 0 && /postal address will be set/i.test(el.textContent)
      );
      return hint?.textContent?.trim() || '';
    });
  }

  // ── Edit Client Modal: Submission helpers ──────────────────────────────────

  async getSaveButtonState() {
    return this.page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return { text: '', disabled: true, loading: false };
      const btns = [...dialog.querySelectorAll('button')];
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
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      const btns = [...dialog.querySelectorAll('button')];
      const btn = btns.find(el => /cancel|close/i.test(el.textContent));
      return btn ? (btn.disabled || btn.getAttribute('aria-disabled') === 'true') : false;
    });
  }

  // Types real keyboard input into a dialog field, triggering React's onChange handler.
  // Use this instead of fillEditForm when testing input sanitization (e.g. phone stripping).
  async typeIntoDialogField(labelText, value) {
    const coords = await this.page.evaluate((label) => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return null;
      const labels = [...dialog.querySelectorAll('label, [class*="MuiInputLabel"]')];
      const lbl = labels.find(el =>
        el.textContent.trim().toLowerCase().includes(label.toLowerCase())
      );
      if (!lbl) return null;
      const input = lbl.htmlFor
        ? document.getElementById(lbl.htmlFor)
        : lbl.closest('[class*="MuiFormControl"]')?.querySelector('input');
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

  // Sets a phone/mobile/date field using the React native setter (like fillEditForm).
  async setDialogField(labelText, value, index = 0) {
    await this.page.evaluate((label, val, idx) => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return;
      const labels = [...dialog.querySelectorAll('label, [class*="MuiInputLabel"]')];
      const matching = labels.filter(el =>
        el.textContent.trim().toLowerCase().includes(label.toLowerCase())
      );
      const lbl = matching[idx];
      if (!lbl) return;
      const input = lbl.htmlFor
        ? document.getElementById(lbl.htmlFor)
        : lbl.closest('[class*="MuiFormControl"]')?.querySelector('input');
      if (!input) return;
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;
      nativeSetter.call(input, val);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, labelText, value, index);
    await new Promise(r => setTimeout(r, 300));
  }

  // Opens the area code adornment dropdown for the Phone or Mobile field.
  async getPhoneAreaCodeOptions(fieldLabel = 'phone') {
    await this.page.evaluate((label) => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return;
      const labels = [...dialog.querySelectorAll('label, [class*="MuiInputLabel"]')];
      const phoneLbl = labels.find(el => el.textContent.trim().toLowerCase().includes(label.toLowerCase()));
      const formControl = phoneLbl?.closest('[class*="MuiFormControl"]');
      const adornment = formControl?.querySelector('[class*="MuiInputAdornment-positionStart"], [class*="MuiInputAdornment-root"]');
      const trigger = adornment?.querySelector('[class*="MuiSelect-select"], [role="combobox"], button');
      if (trigger) {
        trigger.click();
      } else {
        adornment?.click();
      }
    }, fieldLabel);
    await this.page.waitForSelector('[role="listbox"]', { timeout: 3000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 200));
    return this.getDialogSelectOptions();
  }

  // ── Delete Client Dialog helpers ──────────────────────────────────────────────

  async clickDeleteClientButton() {
    // The button has no aria-label or SVG data-testid.
    // Identified by: red computed color rgb(220,38,38) unique on this page,
    // or the standard MUI DeleteIcon SVG path prefix as a fallback.
    await this.page.waitForFunction(
      () => [...document.querySelectorAll('button')].some(el => {
        if (el.closest('[role="dialog"]')) return false;
        if (/delete|remove|trash/i.test(el.getAttribute('aria-label') || '')) return true;
        if (el.querySelector('svg[data-testid="DeleteIcon"],svg[data-testid="DeleteForeverIcon"]')) return true;
        if (window.getComputedStyle(el).color === 'rgb(220, 38, 38)') return true;
        const d = el.querySelector('path')?.getAttribute('d') || '';
        return d.startsWith('M6 19c0 1.1.9 2');
      }),
      { timeout: 10000 }
    );
    const rect = await this.page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(el => {
        if (el.closest('[role="dialog"]')) return false;
        if (/delete|remove|trash/i.test(el.getAttribute('aria-label') || '')) return true;
        if (el.querySelector('svg[data-testid="DeleteIcon"],svg[data-testid="DeleteForeverIcon"]')) return true;
        if (window.getComputedStyle(el).color === 'rgb(220, 38, 38)') return true;
        const d = el.querySelector('path')?.getAttribute('d') || '';
        return d.startsWith('M6 19c0 1.1.9 2');
      });
      if (!btn) return null;
      btn.scrollIntoView({ behavior: 'instant', block: 'center' });
      const r = btn.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!rect) throw new Error('Delete client button not found on page');
    await this.page.mouse.click(rect.x, rect.y);
    await this.page.waitForFunction(
      () => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return false;
        const title = dialog.querySelector('h2,[class*="MuiDialogTitle"]');
        return /delete/i.test(title?.textContent || dialog.textContent.slice(0, 150));
      },
      { timeout: 8000 }
    );
    await new Promise(r => setTimeout(r, 300));
  }

  async isDeleteDialogOpen() {
    return this.page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      const title = dialog.querySelector('h2,[class*="MuiDialogTitle"]');
      return /delete/i.test(title?.textContent || dialog.textContent.slice(0, 150));
    });
  }

  async getDeleteDialogTitle() {
    return this.page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return dialog?.querySelector('h2,[class*="MuiDialogTitle"]')?.textContent?.trim() || '';
    });
  }

  async getDeleteDialogBodyText() {
    return this.page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return '';
      const content = dialog.querySelector('[class*="MuiDialogContent"]');
      return (content || dialog).textContent.trim();
    });
  }

  async getDeleteDialogCaseLinks() {
    return this.page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return [];
      return [...dialog.querySelectorAll('a')].map(a => ({
        text:   a.textContent.trim(),
        href:   a.getAttribute('href') || '',
        target: a.getAttribute('target') || '',
      }));
    });
  }

  async clickDeleteConfirm() {
    // Wait for the confirm button to be present AND enabled — handles the brief
    // disabled period after a previous failed attempt re-enables the button.
    await this.page.waitForFunction(
      () => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return false;
        const btns = [...dialog.querySelectorAll('button')];
        return btns.some(el =>
          /^delete(?:\s+client)?$|^confirm$/i.test(el.textContent.trim()) &&
          !/cancel/i.test(el.textContent.trim()) &&
          !el.disabled && el.getAttribute('aria-disabled') !== 'true'
        );
      },
      { timeout: 7000 }
    ).catch(() => {}); // if timeout let the rect check surface the final error

    const rect = await this.page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return null;
      const btns = [...dialog.querySelectorAll('button')];
      const btn = btns.find(el =>
        /^delete(?:\s+client)?$|^confirm$/i.test(el.textContent.trim()) &&
        !/cancel/i.test(el.textContent.trim())
      );
      if (!btn) return null;
      btn.scrollIntoView({ behavior: 'instant', block: 'center' });
      const r = btn.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!rect) throw new Error('"Delete Client" confirm button not found in dialog');
    await this.page.mouse.click(rect.x, rect.y);
    await new Promise(r => setTimeout(r, 200));
  }

  async clickDeleteCancel() {
    const handle = await this.page.evaluateHandle(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return null;
      const btns = [...dialog.querySelectorAll('button')];
      return btns.find(el => /^cancel$/i.test(el.textContent.trim())) || null;
    });
    const btnEl = handle.asElement();
    if (!btnEl) throw new Error('"Cancel" button not found in delete dialog');
    await btnEl.click();
    await new Promise(r => setTimeout(r, 400));
  }

  async getDeleteConfirmButtonText() {
    return this.page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return '';
      const btns = [...dialog.querySelectorAll('button')];
      const btn = btns.find(el =>
        /delete|deleting/i.test(el.textContent) && !/cancel/i.test(el.textContent)
      );
      return btn?.textContent?.trim() || '';
    });
  }

  async isDeleteConfirmLoading() {
    return this.page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      const btns = [...dialog.querySelectorAll('button')];
      const btn = btns.find(el =>
        /delete|deleting/i.test(el.textContent) && !/cancel/i.test(el.textContent)
      );
      if (!btn) return false;
      return !!btn.querySelector('[class*="CircularProgress"]') || /deleting/i.test(btn.textContent);
    });
  }

  async isDeleteConfirmButtonDisabled() {
    return this.page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      const btns = [...dialog.querySelectorAll('button')];
      const btn = btns.find(el =>
        /delete|deleting/i.test(el.textContent) && !/cancel/i.test(el.textContent)
      );
      return btn ? (btn.disabled || btn.getAttribute('aria-disabled') === 'true') : false;
    });
  }

  async isDeleteCancelButtonDisabled() {
    return this.page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      const btns = [...dialog.querySelectorAll('button')];
      const btn = btns.find(el => /^cancel$/i.test(el.textContent.trim()));
      return btn ? (btn.disabled || btn.getAttribute('aria-disabled') === 'true') : false;
    });
  }

  async getDeleteDialogErrorText() {
    return this.page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return '';
      const alert = dialog.querySelector('[role="alert"],[class*="MuiAlert"]');
      return alert?.textContent?.trim() || '';
    });
  }

  async waitForDeleteDialogClose(timeout = 8000) {
    await this.page.waitForFunction(
      () => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return true;
        const title = dialog.querySelector('h2,[class*="MuiDialogTitle"]');
        return !/delete/i.test(title?.textContent || dialog.textContent.slice(0, 150));
      },
      { timeout }
    );
  }
}

module.exports = ClientDetailPage;
