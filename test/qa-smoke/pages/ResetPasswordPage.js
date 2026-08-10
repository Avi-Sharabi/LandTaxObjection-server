'use strict';

const BasePage = require('./BasePage');

// Guard-state selectors confirmed via helpers/inspect-forgot-password.js against the live page.
// The "Set new password" form itself has never been reached (requires a real, valid, unexpired,
// single-use reset token — see RESET_PASSWORD_TOKEN in forgot-password.test.js), so its
// selectors below are best-effort fallback arrays: label text -> htmlFor -> #id, else fall
// through the array.
const SEL = {
  errorAlert:         '.MuiAlert-colorError',
  requestNewLinkLink: 'a[href="/forgot-password"]',
  spinner:            '.MuiCircularProgress-root',
  helperText:         '.MuiFormHelperText-root',
  passwordToggle:     'button.MuiIconButton-edgeEnd',
  submitButtonFallback: 'button[type="submit"]',
  newPasswordFallbacks: [
    'input[name="password"]',
    'input[name="newPassword"]',
    'input[name="new_password"]',
    'input[type="password"]:not([name*="confirm" i])',
  ],
  confirmPasswordFallbacks: [
    'input[name="confirmPassword"]',
    'input[name="confirm_password"]',
    'input[name="passwordConfirmation"]',
    'input[type="password"][name*="confirm" i]',
  ],
};

class ResetPasswordPage extends BasePage {
  // token: undefined -> no query string at all; '' -> "?token=" (empty value); string -> real token
  async open(token) {
    const qs = token === undefined ? '' : `?token=${encodeURIComponent(token)}`;
    await this.goto(`/reset-password${qs}`);
  }

  // Reads whichever error alert is present via innerText — the app's error-card copy is two
  // lines (title + message) and textContent collapses that newline away.
  async getErrorAlertText() {
    await this.page.waitForSelector(SEL.errorAlert, { timeout: 10000 });
    return this.page.$eval(SEL.errorAlert, el => el.innerText?.trim() || '');
  }

  async isErrorAlertVisible(timeout = 3000) {
    return this.isVisible(SEL.errorAlert, timeout);
  }

  async isMissingTokenState() {
    const text = await this.getErrorAlertText().catch(() => '');
    return /missing reset link/i.test(text);
  }

  async isInvalidTokenState() {
    const text = await this.getErrorAlertText().catch(() => '');
    return /invalid reset link|expired|already.*used|used.*link/i.test(text);
  }

  async isLoadingVisible() {
    return this.page.evaluate((spinnerSel) =>
      !!document.querySelector(spinnerSel) || /validating|checking/i.test(document.body.innerText),
      SEL.spinner
    );
  }

  // Waits for token validation to settle: either an error alert appears, or the password form does.
  async waitForTokenResolution(timeout = 15000) {
    await this.page.waitForFunction(
      (errorSel) => !!document.querySelector(errorSel) || document.querySelectorAll('input[type="password"]').length > 0,
      { timeout },
      SEL.errorAlert
    );
  }

  async clickRequestNewLink() {
    await this.waitAndClick(SEL.requestNewLinkLink);
  }

  async isFormVisible() {
    return this.page.evaluate(() => document.querySelectorAll('input[type="password"]').length > 0);
  }

  // ── Form field resolution (fallback-based — see header note) ────────────────

  async _resolvePasswordSelector(kind) {
    const isConfirm = kind === 'confirm';
    const fallbacks = isConfirm ? SEL.confirmPasswordFallbacks : SEL.newPasswordFallbacks;

    const fromLabel = await this.page.evaluate((wantConfirm) => {
      const labels = [...document.querySelectorAll('label')];
      const lbl = wantConfirm
        ? labels.find(l => /confirm/i.test(l.textContent.trim()))
        : labels.find(l => /password/i.test(l.textContent.trim()) && !/confirm/i.test(l.textContent.trim()));
      if (lbl?.htmlFor) return '#' + lbl.htmlFor;
      return null;
    }, isConfirm);
    if (fromLabel) return fromLabel;

    for (const sel of fallbacks) {
      const exists = await this.page.$(sel).catch(() => null);
      if (exists) return sel;
    }
    return fallbacks[0];
  }

  async fillNewPassword(password) {
    const sel = await this._resolvePasswordSelector('new');
    await this.waitAndType(sel, password);
  }

  async fillConfirmPassword(password) {
    const sel = await this._resolvePasswordSelector('confirm');
    await this.waitAndType(sel, password);
  }

  async fillBothPasswords(password, confirmPassword = password) {
    await this.fillNewPassword(password);
    await this.fillConfirmPassword(confirmPassword);
  }

  async submit() {
    const clicked = await this.page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, [role="button"]')];
      const btn = btns.find(b => /reset password|set.*password|update password|save/i.test(b.textContent.trim()) && !b.disabled)
               || document.querySelector('button[type="submit"]:not(:disabled)');
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!clicked) throw new Error('Reset Password submit button not found or disabled');
  }

  async isSubmitButtonDisabled() {
    return this.page.evaluate((fallbackSel) => {
      const btns = [...document.querySelectorAll('button, [role="button"]')];
      const btn = btns.find(b => /reset password|set.*password|update password|save/i.test(b.textContent)) ||
                  document.querySelector(fallbackSel);
      return btn ? btn.disabled || btn.getAttribute('aria-disabled') === 'true' : false;
    }, SEL.submitButtonFallback);
  }

  // Per-field error, resolved the same way SubmitDisputePage.getFieldError() does; falls back
  // to DOM-order indexing into getAllFieldErrors() if label resolution comes up empty.
  async getFieldError(kind) {
    const isConfirm = kind === 'confirm';
    const fromLabel = await this.page.evaluate((wantConfirm) => {
      const labels = [...document.querySelectorAll('label')];
      const lbl = wantConfirm
        ? labels.find(l => /confirm/i.test(l.textContent.trim()))
        : labels.find(l => /password/i.test(l.textContent.trim()) && !/confirm/i.test(l.textContent.trim()));
      if (!lbl?.htmlFor) return null;
      const input = document.getElementById(lbl.htmlFor);
      const helper = input?.closest('[class*="FormControl" i]')?.querySelector('[class*="HelperText" i]');
      return helper ? helper.textContent.trim() : null;
    }, isConfirm);
    if (fromLabel !== null) return fromLabel;

    const all = await this.getAllFieldErrors();
    return all[isConfirm ? 1 : 0] || '';
  }

  async getAllFieldErrors() {
    const visible = await this.isVisible(SEL.helperText, 2000);
    if (!visible) return [];
    return this.page.$$eval(SEL.helperText, els => els.map(el => el.textContent?.trim() || ''));
  }

  // Scoped to the field's own FormControl container so toggling one field never affects the other.
  async clickPasswordToggle(kind) {
    const sel = await this._resolvePasswordSelector(kind);
    const clicked = await this.page.evaluate((inputSel) => {
      const input = document.querySelector(inputSel);
      const container = input?.closest('[class*="FormControl" i]') || input?.parentElement;
      const toggle = container?.querySelector('button.MuiIconButton-edgeEnd');
      if (toggle) { toggle.click(); return true; }
      return false;
    }, sel);
    if (!clicked) throw new Error(`Password toggle not found for "${kind}" field`);
  }

  async getPasswordInputType(kind) {
    const sel = await this._resolvePasswordSelector(kind);
    return this.page.$eval(sel, el => el.type);
  }

  async getPasswordValue(kind) {
    const sel = await this._resolvePasswordSelector(kind);
    return this.page.$eval(sel, el => el.value);
  }

  // Proxies real password-manager autofill: sets .value via the native input setter (bypassing
  // React's controlled-input tracking) then dispatches input/change, same as a browser autofill
  // does under the hood. Puppeteer has no API to trigger genuine OS-level autofill.
  async autofillPassword(kind, value) {
    const sel = await this._resolvePasswordSelector(kind);
    await this.page.evaluate((selector, val) => {
      const el = document.querySelector(selector);
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, sel, value);
  }

  async waitForRedirectToLogin(timeout = 15000) {
    await this.page.waitForFunction(
      () => window.location.pathname.includes('/login'),
      { timeout }
    );
  }
}

module.exports = ResetPasswordPage;
