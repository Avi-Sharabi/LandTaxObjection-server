'use strict';

const BasePage = require('./BasePage');

// Selectors confirmed via helpers/inspect-forgot-password*.js against the live page
const SEL = {
  emailInput:      'input[name="email"][type="email"]',
  submitButton:    'button[type="submit"]',
  backToLoginLink: 'a[href="/login"]',
  helperText:      '.MuiFormHelperText-root',
  alert:           '.MuiAlert-root',
  successAlert:    '.MuiAlert-colorSuccess',
  spinner:         '.MuiCircularProgress-root',
};

class ForgotPasswordPage extends BasePage {
  async open() {
    await this.goto('/forgot-password');
  }

  async fillEmail(email) {
    await this.waitAndType(SEL.emailInput, email);
  }

  async submit() {
    await this.waitAndClick(SEL.submitButton);
  }

  async requestReset(email) {
    await this.fillEmail(email);
    await this.submit();
  }

  async getFieldError() {
    const visible = await this.isVisible(SEL.helperText, 3000);
    return visible ? this.getText(SEL.helperText) : '';
  }

  async isEmailInvalid() {
    return this.page.$eval(SEL.emailInput, el => el.getAttribute('aria-invalid') === 'true').catch(() => false);
  }

  async isSubmitButtonDisabled() {
    return this.page.$eval(SEL.submitButton, btn =>
      btn.disabled || btn.getAttribute('aria-disabled') === 'true'
    );
  }

  async hasSpinner() {
    return this.page.$eval(SEL.submitButton, (btn, sel) => !!btn.querySelector(sel), SEL.spinner);
  }

  async waitForSuccess(timeout = 15000) {
    await this.page.waitForSelector(SEL.successAlert, { timeout });
  }

  // Reads whichever MUI alert is present (success or error) via innerText —
  // textContent would collapse the multi-line markup some alerts render.
  async getAlertText() {
    await this.page.waitForSelector(SEL.alert, { timeout: 10000 });
    return this.page.$eval(SEL.alert, el => el.innerText?.trim() || '');
  }

  async isSuccessVisible() {
    return this.isVisible(SEL.successAlert, 3000);
  }

  async isFormVisible() {
    return this.isVisible(SEL.emailInput, 2000);
  }

  async clickBackToLogin() {
    await this.waitAndClick(SEL.backToLoginLink);
  }
}

module.exports = ForgotPasswordPage;
