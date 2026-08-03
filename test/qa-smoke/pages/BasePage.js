'use strict';

class BasePage {
  constructor(page) {
    this.page = page;
  }

  async goto(path) {
    // domcontentloaded fires as soon as HTML is parsed; doesn't block on XHR/polling that SPAs fire post-load.
    // Individual waitForSelector calls in each page method handle waiting for React to render elements.
    await this.page.goto(`${process.env.BASE_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }

  async waitAndClick(selector) {
    await this.page.waitForSelector(selector, { visible: true, timeout: 15000 });
    await this.page.click(selector);
  }

  async waitAndType(selector, text) {
    await this.page.waitForSelector(selector, { visible: true, timeout: 15000 });
    await this.page.click(selector, { clickCount: 3 });
    await this.page.type(selector, text);
  }

  async getText(selector) {
    await this.page.waitForSelector(selector, { timeout: 10000 });
    return this.page.$eval(selector, el => el.textContent?.trim() || '');
  }

  async isVisible(selector, timeout = 5000) {
    try {
      await this.page.waitForSelector(selector, { visible: true, timeout });
      return true;
    } catch {
      return false;
    }
  }

  async currentUrl() {
    return this.page.url();
  }
}

module.exports = BasePage;
