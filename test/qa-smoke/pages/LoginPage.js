'use strict';

const BasePage = require('./BasePage');

// Selectors confirmed via inspector.js against the live page
const SEL = {
  emailInput:    'input[name="email"]',
  passwordInput: 'input[name="password"]',
  submitButton:  '[data-testid="login-submit-btn"]',
  // MUI Alert (shown on auth failure)
  errorAlert:    '.MuiAlert-message',
  // MUI field-level helper text
  helperText:    '.MuiFormHelperText-root',
  // Eye icon toggle inside MUI InputAdornment (no aria-label; identified via class)
  passwordToggle: 'button.MuiIconButton-edgeEnd',
  // "Register here" anchor (confirmed via inspector)
  registerLink:  'a[href*="register"]',
};

class LoginPage extends BasePage {
  async open() {
    await this.goto('/login');
  }

  async fillEmail(email) {
    await this.waitAndType(SEL.emailInput, email);
  }

  async fillPassword(password) {
    await this.waitAndType(SEL.passwordInput, password);
  }

  async submit() {
    await this.waitAndClick(SEL.submitButton);
  }

  async login(email, password) {
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.submit();
  }

  async getErrorMessage() {
    const alertVisible = await this.isVisible(SEL.errorAlert, 5000);
    if (alertVisible) return this.getText(SEL.errorAlert);
    const helperVisible = await this.isVisible(SEL.helperText, 2000);
    if (helperVisible) return this.getText(SEL.helperText);
    return '';
  }

  async waitForSuccessfulLogin() {
    // Accountant role lands on /accountant/dashboard after login
    await this.page.waitForFunction(
      () => window.location.pathname.includes('/dashboard'),
      { timeout: 15000 }
    );
  }

  async isOnLoginPage() {
    const url = await this.currentUrl();
    return url.includes('/login');
  }

  async clickPasswordToggle() {
    await this.waitAndClick(SEL.passwordToggle);
  }

  async getPasswordInputType() {
    return this.page.$eval(SEL.passwordInput, el => el.type);
  }

  // "Forgot password?" is not a standard <a> or <button> — find by visible text
  async clickForgotPassword() {
    const clicked = await this.page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      while (walker.nextNode()) {
        const el = walker.currentNode;
        if (el.children.length === 0 && /forgot/i.test(el.textContent)) {
          el.click();
          return true;
        }
      }
      return false;
    });
    if (!clicked) throw new Error('Forgot password element not found in DOM');
  }

  async clickRegisterLink() {
    await this.waitAndClick(SEL.registerLink);
  }

  async getAllHelperTexts() {
    await this.page.waitForSelector(SEL.helperText, { timeout: 5000 });
    return this.page.$$eval(SEL.helperText, els => els.map(el => el.textContent?.trim() || ''));
  }

  async isSubmitButtonDisabled() {
    return this.page.$eval(SEL.submitButton, btn =>
      btn.disabled || btn.getAttribute('aria-disabled') === 'true'
    );
  }
}

module.exports = { LoginPage, SEL };
