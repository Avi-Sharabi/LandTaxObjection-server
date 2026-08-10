'use strict';

const BasePage = require('./BasePage');

class DashboardPage extends BasePage {
  async open() {
    await this.goto('/accountant/dashboard');
  }

  async isLoaded() {
    const url = await this.currentUrl();
    return url.includes('/dashboard');
  }

  async waitForLoad() {
    await this.page.waitForFunction(
      () => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
        .some(el => el.textContent.includes('Dashboard')),
      { timeout: 20000 }
    );
    // Wait for at least one KPI card label to be present
    await this.page.waitForFunction(
      () => /active cases|due this week|overdue|evidence/i.test(document.body.innerText),
      { timeout: 15000 }
    ).catch(() => {});
  }

  // Unlike the page shell (heading renders regardless of auth state), the KPI card text
  // only appears once the dashboard's real data API call has returned — a reliable signal
  // for "is this session actually authenticated", used as an auth probe elsewhere (see
  // dashboard.test.js). Resolves true/false rather than throwing.
  async isDataLoaded(timeout = 8000) {
    return this.page.waitForFunction(
      () => /active cases|due this week|overdue|evidence/i.test(document.body.innerText),
      { timeout }
    ).then(() => true).catch(() => false);
  }

  async getHeading() {
    await this.page.waitForFunction(
      () => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
        .some(el => el.textContent.includes('Dashboard')),
      { timeout: 15000 }
    );
    return this.page.evaluate(
      () => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
        .find(el => el.textContent.includes('Dashboard'))?.textContent?.trim() || ''
    );
  }

  async getSubtitle() {
    return this.page.evaluate(() => {
      const candidates = [...document.querySelectorAll('p, h5, h6, span, [class*="subtitle" i], [class*="description" i]')];
      const match = candidates.find(el =>
        /overview|portfolio|dispute/i.test(el.textContent) &&
        el.textContent.trim().length > 5 &&
        el.textContent.trim().length < 120
      );
      return match?.textContent?.trim() || '';
    });
  }

  async getUserName() {
    return this.page.evaluate(() => {
      const candidates = [
        ...document.querySelectorAll(
          '.MuiChip-label, [class*="UserName"], [class*="userName"], [class*="avatar"] + *, span'
        ),
      ];
      return candidates.map(el => el.textContent?.trim()).find(t => t && t.length > 3) || '';
    });
  }

  async getUserRole() {
    return this.page.evaluate(() => {
      const candidates = [
        ...document.querySelectorAll('.MuiChip-label, [class*="chip" i], [class*="badge" i], [class*="role" i], span'),
      ];
      const match = candidates.find(el => /accountant/i.test(el.textContent));
      return match?.textContent?.trim() || '';
    });
  }

  // Returns the numeric count displayed in a KPI card matching the given label pattern.
  async getKpiCount(labelPattern) {
    return this.page.evaluate((pattern) => {
      const re = new RegExp(pattern, 'i');
      const leafEls = [...document.querySelectorAll('*')].filter(el => el.children.length === 0);
      const labelEl = leafEls.find(el =>
        re.test(el.textContent.trim()) && el.textContent.trim().length < 50
      );
      if (!labelEl) return null;
      const card = labelEl.closest('[class*="card" i], [class*="Card"], [class*="stat" i], [class*="kpi" i], [class*="summary" i]') ||
                   labelEl.parentElement?.parentElement;
      if (!card) return null;
      const numbers = [...card.querySelectorAll('*')]
        .filter(el => el.children.length === 0)
        .map(el => el.textContent.trim())
        .filter(t => /^\d+$/.test(t));
      return numbers.length > 0 ? parseInt(numbers[0]) : null;
    }, labelPattern);
  }

  // Returns the full text of a KPI card container for the given label.
  async getStat(label) {
    return this.page.evaluate(labelText => {
      const els = [...document.querySelectorAll('*')];
      const labelEl = els.find(el =>
        el.children.length === 0 && el.textContent.trim() === labelText
      );
      if (!labelEl) return null;
      const container = labelEl.closest('[class*="card" i], [class*="Card"], [class*="stat" i]');
      return container?.textContent?.replace(labelText, '').trim() || null;
    }, label);
  }

  // Returns { displayValue: "58/100", progressPercent: 58 } for the Avg Evidence Score card.
  async getAvgEvidenceScore() {
    return this.page.evaluate(() => {
      const leafEls = [...document.querySelectorAll('*')].filter(el => el.children.length === 0);
      const labelEl = leafEls.find(el =>
        /avg.*evidence|evidence.*score/i.test(el.textContent.trim())
      );
      if (!labelEl) return null;
      const card = labelEl.closest('[class*="card" i], [class*="Card"]') ||
                   labelEl.parentElement?.parentElement;
      if (!card) return null;

      const scoreText = [...card.querySelectorAll('*')]
        .filter(el => el.children.length === 0)
        .map(el => el.textContent.trim())
        .find(t => /\d+\/\d+/.test(t));

      const progressBar = card.querySelector('[role="progressbar"], [class*="progress" i], [class*="Progress"]');
      let progressPercent = null;
      if (progressBar) {
        const ariaVal = progressBar.getAttribute('aria-valuenow');
        if (ariaVal !== null) {
          progressPercent = parseFloat(ariaVal);
        } else {
          const style = progressBar.style.width || progressBar.style.transform || '';
          const pctMatch = style.match(/[\d.]+/);
          if (pctMatch) progressPercent = parseFloat(pctMatch[0]);
        }
      }

      return { displayValue: scoreText || null, progressPercent };
    });
  }

  // Returns array of { text, daysLeft, badgeClass } from the Deadline Risk Panel.
  // daysLeft is an integer (0 = due today, negative if we can't parse).
  async getDeadlineRiskEntries() {
    return this.page.evaluate(() => {
      const leafEls = [...document.querySelectorAll('*')].filter(el => el.children.length === 0);
      const headerEl = leafEls.find(el =>
        /deadline risk/i.test(el.textContent.trim()) && el.textContent.trim().length < 40
      );
      if (!headerEl) return [];

      const panel = headerEl.closest(
        '[class*="card" i], [class*="Card"], [class*="paper" i], [class*="panel" i], section'
      ) || headerEl.parentElement?.parentElement?.parentElement;
      if (!panel) return [];

      const rows = [...panel.querySelectorAll('li, [class*="row" i], [class*="item" i]')]
        .filter(el => {
          const text = el.textContent.trim();
          return text.length > 5 && !/deadline risk|view all/i.test(text);
        });

      return rows.slice(0, 10).map(row => {
        const text = row.textContent.trim();
        const daysMatch = text.match(/(\d+)\s*d\s*left/i);
        const dueTodayMatch = /due\s*today|0\s*d\s*left/i.test(text);
        const daysLeft = dueTodayMatch ? 0 : (daysMatch ? parseInt(daysMatch[1]) : null);

        const badge = row.querySelector('[class*="chip" i], [class*="badge" i], [class*="tag" i], [class*="Chip"]');
        const badgeClass = badge ? badge.className : '';
        const badgeText = badge ? badge.textContent.trim() : '';

        return { text, daysLeft, badgeClass, badgeText };
      }).filter(r => r.daysLeft !== null);
    });
  }

  // Returns array of { text, dotColorClass } from the Recent Activity panel.
  async getRecentActivityEntries() {
    return this.page.evaluate(() => {
      const leafEls = [...document.querySelectorAll('*')].filter(el => el.children.length === 0);
      const headerEl = leafEls.find(el =>
        /recent activity/i.test(el.textContent.trim()) && el.textContent.trim().length < 30
      );
      if (!headerEl) return [];

      const panel = headerEl.closest(
        '[class*="card" i], [class*="Card"], [class*="paper" i], [class*="panel" i], section'
      ) || headerEl.parentElement?.parentElement?.parentElement;
      if (!panel) return [];

      const items = [...panel.querySelectorAll('li, [class*="item" i], [class*="activity" i], [class*="entry" i]')]
        .filter(el => el.textContent.trim().length > 5 && !/recent activity/i.test(el.textContent.trim()));

      return items.slice(0, 10).map(item => {
        const dot = item.querySelector('span:first-child, [class*="dot" i], [class*="indicator" i], [class*="avatar" i]');
        return {
          text: item.textContent.trim(),
          dotColorClass: dot ? dot.className : '',
        };
      });
    });
  }

  // Clicks the "View All" link in the Deadline Risk Panel and waits for navigation.
  async clickViewAll() {
    const prevUrl = await this.currentUrl();
    const clicked = await this.page.evaluate(() => {
      const links = [...document.querySelectorAll('a, button, [role="button"]')];
      const match = links.find(el => /view all/i.test(el.textContent.trim()));
      if (match) { match.click(); return true; }
      return false;
    });
    if (!clicked) throw new Error('"View All" link not found');
    await this.page.waitForFunction(
      (prev) => window.location.href !== prev,
      { timeout: 10000 },
      prevUrl
    ).catch(() => {});
    await new Promise(r => setTimeout(r, 800));
  }

  // Clicks the "+ New Case" button and waits for a form or navigation.
  async clickNewCase() {
    const clicked = await this.page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, [role="button"], a')];
      const match = btns.find(el => /new case/i.test(el.textContent));
      if (match) { match.click(); return true; }
      return false;
    });
    if (!clicked) throw new Error('"+ New Case" button not found');
    await this.page.waitForFunction(
      () => !!(
        document.querySelector('[role="dialog"]') ||
        document.querySelector('[class*="Drawer" i]') ||
        window.location.pathname.includes('/new')
      ),
      { timeout: 10000 }
    ).catch(() => {});
    await new Promise(r => setTimeout(r, 500));
  }

  // Returns { found, hasUnread, badgeText } for the notification bell.
  async getNotificationInfo() {
    return this.page.evaluate(() => {
      const bell = document.querySelector(
        '[aria-label*="notification" i], [aria-label*="bell" i], [data-testid*="notification" i], [data-testid*="bell" i]'
      );
      const container = bell ? (bell.closest('button') || bell.parentElement) : null;
      if (!container && !bell) return { found: false, hasUnread: false, badgeText: null };

      const badge = (container || bell).querySelector('[class*="badge" i], [class*="Badge"], [class*="dot" i]');
      const badgeText = badge ? badge.textContent.trim() : null;

      return {
        found: true,
        hasUnread: !!(badge),
        badgeText,
      };
    });
  }

  // Clicks the notification bell icon.
  async clickNotificationBell() {
    const clicked = await this.page.evaluate(() => {
      const bell = document.querySelector(
        '[aria-label*="notification" i], [aria-label*="bell" i], [data-testid*="notification" i]'
      );
      if (bell) { (bell.closest('button') || bell).click(); return true; }
      return false;
    });
    if (!clicked) throw new Error('Notification bell not found');
    await new Promise(r => setTimeout(r, 600));
  }

  // Clicks a sidebar link by its visible text (case-insensitive prefix match).
  async clickSidebarLink(linkText) {
    const clicked = await this.page.evaluate((text) => {
      const allEls = [...document.querySelectorAll('a, button, li, [role="menuitem"], [role="button"], div[tabindex]')];
      const leftEls = allEls.filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.left < 350 && rect.width > 10 && rect.height > 10;
      });
      const match = (arr) => arr.find(el =>
        el.textContent.trim().toLowerCase() === text.toLowerCase() ||
        el.textContent.trim().toLowerCase().startsWith(text.toLowerCase())
      );
      const found = match(leftEls) || match(allEls);
      if (found) { found.click(); return true; }
      return false;
    }, linkText);
    if (!clicked) throw new Error(`Sidebar link "${linkText}" not found`);
    await new Promise(r => setTimeout(r, 1200));
  }

  // Returns true if the sidebar link for the given text has an active/selected state.
  async isSidebarLinkActive(linkText) {
    return this.page.evaluate((text) => {
      const allEls = [...document.querySelectorAll('a, button, li, [role="menuitem"]')];
      const leftEls = allEls.filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.left < 350 && rect.width > 10;
      });
      const match = leftEls.find(el =>
        el.textContent.trim().toLowerCase() === text.toLowerCase() ||
        el.textContent.trim().toLowerCase().startsWith(text.toLowerCase())
      );
      if (!match) return false;
      const cls = match.className + (match.closest('li, [class]')?.className || '');
      return /active|selected|current/i.test(cls) ||
             match.getAttribute('aria-current') === 'page' ||
             match.getAttribute('aria-selected') === 'true';
    }, linkText);
  }

  async logout() {
    await this.page.waitForFunction(
      () => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
        .some(el => el.textContent.includes('Dashboard')),
      { timeout: 20000 }
    );

    const direct = await this.page.$('[aria-label*="logout" i], [data-testid*="logout"], [aria-label*="sign out" i]');
    if (direct) { await direct.click(); return; }

    const avatar = await this.page.$('.MuiAvatar-root, [aria-label*="account" i], [data-testid*="user-menu"]');
    if (avatar) {
      await avatar.click();
      try {
        await this.page.waitForSelector('[role="menuitem"], [role="menu"] li', { timeout: 5000 });
        const clicked = await this.page.evaluate(() => {
          const items = [...document.querySelectorAll('[role="menuitem"], [role="menu"] li')];
          const match = items.find(el => /logout|sign out/i.test(el.textContent));
          if (match) { match.click(); return true; }
          return false;
        });
        if (clicked) return;
      } catch (e) {
        // fall through
      }
    }

    const found = await this.page.evaluate(() => {
      const el = [...document.querySelectorAll('button, [role="button"], a')]
        .find(e => /logout|sign out/i.test(e.textContent));
      if (el) { el.click(); return true; }
      return false;
    });
    if (found) return;

    throw new Error('No logout control found');
  }

  async waitForLogout() {
    await this.page.waitForFunction(
      () => window.location.pathname.includes('/login'),
      { timeout: 15000 }
    );
  }
}

module.exports = DashboardPage;
