import { expect, test } from '@playwright/test';
import { TEST_CARDS } from '../../Backend/packages/mock-providers/src/index.js';
import { site } from '../support/env.js';
import { A, eventually, world } from '../support/api.js';
import { staffSignIn } from '../support/pages.js';
import { watchContract } from '../support/watch.js';

let w;
let t;
let data;

test.beforeAll(async () => {
  w = world();
  t = await w.tenantWithStaff({ roles: ['finance', 'sales_manager'] });
  const s = await w.seedSales(t.owner, { price: 600_000_00, downPct: 20, installments: 6 });
  const booking = await w.book(t.owner, s, { bookedAt: w.daysAgo(130) });
  await w.sweep();
  const invoices = await w.invoicesOf(t.owner, booking.id);
  await t.staff.finance.post(`${A}/installments/${invoices[0].id}/pay`, { method: 'cash', amount: invoices[0].balance });
  // a card payment on the second invoice, through Stripe's stand-in
  const checkout = await t.staff.finance.post(`${A}/installments/${invoices[1].id}/checkout-session`, {});
  await w.payOnStripe(checkout, TEST_CARDS.VISA);
  await eventually(async () => (await t.owner.get(`${A}/checkout-sessions/${checkout.checkout_id}`)).status !== 'open', { what: 'checkout settled' });
  await t.owner.post(`${A}/projects/${s.project.id}/map/upload-url`, { filename: 'x.png', content_type: 'image/png', size: 10 }).catch(() => {});
  data = { ...s, booking, invoices };
});

const SCREENS = [
  ['dashboard', '/', /welcome back/i],
  ['collection stats', '/stats', /stats/i],
  ['escalated cases', '/stats/escalations', /stats/i],
  ['projects', '/inventory/projects', /projects/i],
  ['units', '/inventory/units', /units/i],
  ['sales', '/sales', /sales|bookings/i],
  ['customers', '/customers', /customers/i],
  ['card transactions', '/payments/transactions', /transactions/i],
  ['daily collection', '/payments/collections', /collection/i],
  ['support requests', '/support', /support/i],
  ['fine rates', '/settings/fines', /fine/i],
  ['roles and permissions', '/settings/permissions', /permission|roles/i],
];

test.describe('every staff screen shows real data without breaking the API contract', () => {
  for (const [name, path, heading] of SCREENS) {
    test(name, async ({ page }) => {
      const watch = watchContract(page);
      await staffSignIn(page, site().mgmtUrl, { email: t.ownerEmail, secret: t.ownerSecret });
      await page.goto(`${site().mgmtUrl}${path}`);
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/something went wrong|could not load/i)).toHaveCount(0);
      watch.assertClean(name);
    });
  }

  test('detail screens: project, unit, booking with its schedule, customer', async ({ page }) => {
    const watch = watchContract(page);
    await staffSignIn(page, site().mgmtUrl, { email: t.ownerEmail, secret: t.ownerSecret });
    for (const path of [
      `/inventory/projects/${data.project.id}`,
      `/inventory/units/${data.unit.id}`,
      `/sales/${data.booking.id}`,
      `/customers/${data.customer.id}`,
    ]) {
      await page.goto(`${site().mgmtUrl}${path}`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main h1, main h2').first()).toBeVisible();
      await expect(page.getByText(/something went wrong|could not load|not found/i)).toHaveCount(0);
      watch.assertClean(path);
    }
    await page.goto(`${site().mgmtUrl}/sales/${data.booking.id}`);
    await expect(page.getByText(data.invoices[0].invoice_no).first()).toBeVisible();
    await expect(page.getByText(data.invoices[1].invoice_no).first()).toBeVisible();
  });
});
