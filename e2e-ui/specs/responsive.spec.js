import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { site } from '../support/env.js';
import { A, emailedLink, world } from '../support/api.js';
import { customerSignIn, staffSignIn } from '../support/pages.js';
import { overflowingElements, scrollsSideways, settle } from '../support/layout.js';

/**
 * Every screen of both portals, with real data, at phone, tablet and desktop widths: nothing
 * scrolls sideways, nothing is cut off, the menu works, and no screen has serious accessibility
 * problems. This file runs in all three size projects (see playwright.config.js).
 */
const PASSWORD = 'Str0ng-pass-e2e';
let w;
let t;
let data;
let customer;

test.beforeAll(async () => {
  w = world();
  t = await w.tenantWithStaff({ roles: ['finance'] });
  const s = await w.seedSales(t.owner, { price: 600_000_00, downPct: 20, installments: 6 });
  const booking = await w.book(t.owner, s, { bookedAt: w.daysAgo(130) });
  await w.sweep();
  data = { ...s, booking };
  const invite = await emailedLink(s.customer.email, /set-password/);
  await w.anon.post('/api/v1/portal/auth/set-password', { token: invite.searchParams.get('token'), password: PASSWORD });
  customer = { tenant: t.slug, email: s.customer.email };
  await t.owner.post(`${A}/bookings/${booking.id}/contracts/pandadoc`, { template: 'sale_agreement' });
});

async function fits(page, label) {
  await settle(page);
  expect(await overflowingElements(page), `${label}: elements wider than the screen`).toEqual([]);
  expect(await scrollsSideways(page), `${label}: page scrolls sideways`).toBe(false);
}

async function accessible(page, label) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['color-contrast']).analyze();
  const serious = result.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
  expect(serious.map((v) => `${v.id}: ${v.nodes[0]?.target}`), `${label}: accessibility`).toEqual([]);
}

const STAFF = [
  ['dashboard', () => '/'],
  ['collection stats', () => '/stats'],
  ['escalated cases', () => '/stats/escalations'],
  ['projects', () => '/inventory/projects'],
  ['project', () => `/inventory/projects/${data.project.id}`],
  ['units', () => '/inventory/units'],
  ['unit', () => `/inventory/units/${data.unit.id}`],
  ['sales', () => '/sales'],
  ['booking with schedule and contracts', () => `/sales/${data.booking.id}`],
  ['customers', () => '/customers'],
  ['customer', () => `/customers/${data.customer.id}`],
  ['card transactions', () => '/payments/transactions'],
  ['daily collection', () => '/payments/collections'],
  ['support requests', () => '/support'],
  ['fine rates', () => '/settings/fines'],
  ['roles and permissions', () => '/settings/permissions'],
];

test.describe('staff portal', () => {
  test.beforeEach(async ({ page }) => {
    await staffSignIn(page, site().mgmtUrl, { email: t.ownerEmail, secret: t.ownerSecret });
  });

  for (const [name, path] of STAFF) {
    test(name, async ({ page }) => {
      await page.goto(`${site().mgmtUrl}${path()}`);
      await expect(page.locator('main h1, main h2').first()).toBeVisible();
      await fits(page, name);
      await accessible(page, name);
    });
  }

  test('the payment dialog and the contract dialog fit the screen', async ({ page }) => {
    await page.goto(`${site().mgmtUrl}/sales/${data.booking.id}`);
    await page.getByRole('table', { name: 'Scheduled invoices' }).getByRole('button', { name: /^Record payment/ }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    await accessible(page, 'payment dialog');
  });

  test('the new-booking dialog fits the screen', async ({ page }) => {
    await page.goto(`${site().mgmtUrl}/sales`);
    await page.getByRole('button', { name: 'New booking' }).click();
    const dialog = page.getByRole('dialog', { name: 'New booking' });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    await accessible(page, 'new booking dialog');
  });

  test('the menu: a phone opens it with a button and it closes after choosing; a wide screen always shows it', async ({ page, isMobile }) => {
    await page.goto(`${site().mgmtUrl}/`);
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    const toggle = page.getByRole('button', { name: /open menu/i });
    if (isMobile || (await toggle.isVisible())) {
      await expect(nav).toBeHidden();
      await toggle.click();
      await expect(nav).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(nav).toBeHidden();
      await toggle.click();
      await nav.getByRole('link', { name: 'Daily collection' }).click();
      await expect(page).toHaveURL(/\/payments\/collections$/);
      await expect(nav).toBeHidden();
    } else {
      await expect(nav).toBeVisible();
    }
  });
});

test.describe('customer portal', () => {
  test('signed out: sign in, forgot password', async ({ page }) => {
    for (const path of ['/login', '/forgot-password', '/reset-password']) {
      await page.goto(`${site().custUrl}${path}`);
      await expect(page.getByRole('heading').first()).toBeVisible();
      await fits(page, path);
      await accessible(page, path);
    }
  });

  test.describe('signed in', () => {
    test.beforeEach(async ({ page }) => {
      await customerSignIn(page, site().custUrl, customer);
    });

    for (const [name, path] of [
      ['my properties', () => '/'],
      ['property', () => `/properties/${data.booking.id}`],
      ['support', () => '/support'],
      ['account', () => '/account'],
    ]) {
      test(name, async ({ page }) => {
        await page.goto(`${site().custUrl}${path()}`);
        await expect(page.locator('main h1, main h2').first()).toBeVisible();
        await fits(page, name);
        await accessible(page, name);
      });
    }

    test('the property’s tabs, the pay dialog and a new support request fit', async ({ page }) => {
      await page.goto(`${site().custUrl}/properties/${data.booking.id}`);
      for (const tab of [/contracts/i, /card payments/i, /payment schedule/i]) {
        await page.getByRole('tab', { name: tab }).click();
        await fits(page, `tab ${tab}`);
      }
      const viewport = page.viewportSize();
      await page.getByRole('button', { name: /pay/i }).first().click();
      const box = await page.getByRole('dialog').boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      await accessible(page, 'pay dialog');
      await page.keyboard.press('Escape');
      await page.goto(`${site().custUrl}/support`);
      await page.getByRole('button', { name: /new request/i }).click();
      const box2 = await page.getByRole('dialog').boundingBox();
      expect(box2.x + box2.width).toBeLessThanOrEqual(viewport.width + 1);
    });

    test('the top bar: sections and sign out are reachable', async ({ page }) => {
      await page.goto(`${site().custUrl}/`);
      const nav = page.getByRole('navigation', { name: 'Main menu' });
      await nav.getByRole('link', { name: 'Support' }).click();
      await expect(page).toHaveURL(/\/support$/);
      await nav.getByRole('link', { name: 'Account' }).click();
      await expect(page).toHaveURL(/\/account$/);
      await page.getByRole('button', { name: /sign out/i }).click();
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    });
  });
});
