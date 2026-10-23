import { expect, test } from '@playwright/test';
import { TEST_CARDS } from '../../Backend/packages/mock-providers/src/index.js';
import { site } from '../support/env.js';
import { A, eventually, world } from '../support/api.js';
import { staffSignIn } from '../support/pages.js';
import { watchContract } from '../support/watch.js';

test('the daily collection, day by day: who was charged, who failed and why, who was skipped', async ({ page }) => {
  const w = world();
  const t = await w.tenantWithStaff({ roles: ['finance'] });
  const stripe = site().stripeUrl;
  const buyer = async (card, email) => {
    const s = await w.seedSales(t.owner, { price: 100_000_00, downPct: 50, installments: 2, email });
    const b = await w.book(t.owner, s);
    if (card) {
      const session = await t.staff.finance.post(`${A}/customers/${s.customer.id}/payment-methods/setup-session`, {});
      await w.payOnStripe(session, card);
      await eventually(async () => (await t.staff.finance.get(`${A}/customers/${s.customer.id}/payment-methods`)).data.length === 1, { what: 'card saved' });
    }
    return { s, b };
  };
  await buyer(TEST_CARDS.VISA, 'paid@ui.e2e.test');
  await buyer(TEST_CARDS.MASTERCARD, 'broke@ui.e2e.test');
  await buyer(TEST_CARDS.THREE_D_SECURE, 'auth@ui.e2e.test');
  await buyer(null, 'nocard@ui.e2e.test');
  const pms = await (await fetch(`${stripe}/_mock/payment-methods`)).json();
  const broke = pms.find((p) => p.last4 === '4444');
  await fetch(`${stripe}/_mock/payment-methods/${broke.id}/decline`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'card_declined', decline_code: 'insufficient_funds', message: 'Your card has insufficient funds.' }),
  });
  await w.sweep();
  const run = await fetch(`${site().urls.billing}/internal/jobs/collect`, { method: 'POST', headers: { 'x-internal-token': 'e2e-internal-token', 'content-type': 'application/json' }, body: '{}' });
  expect(run.status).toBe(200);
  await eventually(async () => {
    const day = await t.staff.finance.get(`${A}/collection-runs/today`);
    return day.data.length >= 4 && day.data.every((a) => !['queued', 'in_progress'].includes(a.status));
  }, { what: 'every charge settled' });

  const watch = watchContract(page);
  await staffSignIn(page, site().mgmtUrl, { email: t.logins.finance.email, secret: t.logins.finance.secret });
  await page.goto(`${site().mgmtUrl}/payments/collections`);
  await expect(page.getByRole('heading', { name: 'Daily card collection' })).toBeVisible();
  const days = page.getByRole('list', { name: 'Collection days' });
  await expect(days.getByRole('link').first()).toContainText(/1 charged/);
  await expect(days.getByRole('link').first()).toContainText(/2 failed/);
  await days.getByRole('link').first().click();

  // a phone shows cards and a wide screen a table; only the one on screen counts
  const main = { getByText: (text) => page.getByRole('main').getByText(text).filter({ visible: true }) };
  await expect(main.getByText('Insufficient balance on the card').first()).toBeVisible();
  await expect(main.getByText('Stripe code: insufficient_funds').first()).toBeVisible();
  await expect(main.getByText('The bank needs the customer to confirm the payment').first()).toBeVisible();
  await expect(main.getByText('The customer has no saved card').first()).toBeVisible();
  await expect(main.getByText('Balance was enough').first()).toBeVisible();
  await expect(main.getByText(/Will retry on/).first()).toBeVisible();
  await expect(main.getByText('Will not retry automatically').first()).toBeVisible();

  await page.getByLabel('Show').selectOption('failed');
  await expect(page).toHaveURL(/status=failed/);
  await expect(main.getByText('Charged successfully')).toHaveCount(0);
  await expect(main.getByText('Insufficient balance on the card').first()).toBeVisible();
  watch.assertClean('collection history');
});
