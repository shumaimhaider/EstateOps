import { expect, test } from '@playwright/test';
import { site } from '../support/env.js';
import { A, eventually, world } from '../support/api.js';
import { staffSignIn } from '../support/pages.js';
import { watchContract } from '../support/watch.js';

let w;
let t;

test.beforeAll(async () => {
  w = world();
  t = await w.tenantWithStaff({ roles: ['sales_manager', 'auditor'] });
});

/** Inventory, a customer and a plan, but no booking: the booking is what the test makes in the browser. */
async function stock(opts = {}) {
  return w.seedSales(t.owner, { price: 500_000_00, downPct: 20, installments: 4, ...opts });
}
/** Picks the option whose text contains `text` (Playwright's label matching is exact). */
async function choose(select, text) {
  const value = await select.evaluate((el, wanted) => [...el.options].find((o) => o.text.includes(wanted))?.value, text);
  expect(value, `an option containing "${text}"`).toBeTruthy();
  await select.selectOption(value);
}
const signIn = (page, who) => staffSignIn(page, site().mgmtUrl, { email: t.logins[who].email, secret: t.logins[who].secret });

test('a sales manager books a unit for a customer from the Sales page; the schedule appears by itself', async ({ page }) => {
  const watch = watchContract(page);
  const s = await stock({ unitNo: 'BK-1' });
  await signIn(page, 'sales_manager');
  await page.goto(`${site().mgmtUrl}/sales`);
  await page.getByRole('button', { name: 'New booking' }).click();
  const dialog = page.getByRole('dialog', { name: 'New booking' });

  await dialog.getByLabel('Find an available unit').fill('BK-1');
  await choose(dialog.getByLabel('Unit', { exact: true }), `BK-1 · ${s.project.name}`);
  await dialog.getByLabel('Find a customer').fill(s.customer.email.slice(0, 8));
  await dialog.getByLabel('Customer', { exact: true }).selectOption({ index: 1 });
  await choose(dialog.getByLabel('Payment plan'), s.plan.name);
  await dialog.getByRole('button', { name: 'Create booking' }).click();

  // lands on the booking; it is set up by the server within seconds and then shows its schedule
  await expect(page).toHaveURL(/\/sales\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/Setting up this booking|INV-/).first()).toBeVisible();
  const table = page.getByRole('table', { name: 'Scheduled invoices' });
  await expect(table.getByText(/INV-/).first()).toBeVisible({ timeout: 30_000 });
  await expect(table.getByRole('row')).toHaveCount(1 + 5); // header + down payment + 4 installments

  const bookingId = page.url().split('/').pop();
  const booking = await t.owner.get(`${A}/bookings/${bookingId}`);
  expect(booking).toMatchObject({ unit_id: s.unit.id, customer_id: s.customer.id, status: 'active', total_price: 500_000_00 });
  const unit = await eventually(async () => {
    const u = await t.owner.get(`${A}/units/${s.unit.id}`);
    return u.status === 'booked' ? u : null;
  }, { what: 'unit booked' });
  expect(unit.status).toBe('booked');
  watch.assertClean('new booking');
});

test('the Book this unit button on an available unit opens the form with the unit already chosen', async ({ page }) => {
  const s = await stock({ unitNo: 'BK-2' });
  await signIn(page, 'sales_manager');
  await page.goto(`${site().mgmtUrl}/inventory/units/${s.unit.id}`);
  await page.getByRole('button', { name: 'Book this unit' }).click();
  const dialog = page.getByRole('dialog', { name: 'New booking' });
  await expect(dialog.getByText(/BK-2/)).toBeVisible();
  await expect(dialog.getByLabel('Find an available unit')).toHaveCount(0);
  await dialog.getByLabel('Customer', { exact: true }).selectOption({ index: 1 });
  await dialog.getByLabel('Payment plan').selectOption({ index: 1 });
  await dialog.getByRole('button', { name: 'Create booking' }).click();
  await expect(page).toHaveURL(/\/sales\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('table', { name: 'Scheduled invoices' }).getByText(/INV-/).first()).toBeVisible({ timeout: 30_000 });
});

test('the form asks for what is missing and nothing is created', async ({ page }) => {
  const s = await stock({ unitNo: 'BK-3' });
  await signIn(page, 'sales_manager');
  await page.goto(`${site().mgmtUrl}/sales`);
  await page.getByRole('button', { name: 'New booking' }).click();
  const dialog = page.getByRole('dialog', { name: 'New booking' });
  await dialog.getByRole('button', { name: 'Create booking' }).click();
  await expect(dialog.getByText('Choose the unit to book')).toBeVisible();
  await expect(dialog.getByText('Choose the customer who is buying')).toBeVisible();
  await expect(dialog.getByText('Choose the payment plan to follow')).toBeVisible();
  expect((await t.owner.get(`${A}/bookings`, { unit_id: s.unit.id })).data).toEqual([]);
});

test('a unit that is taken can no longer be offered, and an auditor has no New booking button', async ({ page }) => {
  const s = await stock({ unitNo: 'BK-4' });
  await w.book(t.owner, s);
  await signIn(page, 'sales_manager');
  await page.goto(`${site().mgmtUrl}/sales`);
  await page.getByRole('button', { name: 'New booking' }).click();
  const dialog = page.getByRole('dialog', { name: 'New booking' });
  await dialog.getByLabel('Find an available unit').fill('BK-4');
  await expect(dialog.getByText('No available unit matches.')).toBeVisible();
  await page.keyboard.press('Escape');

  const agent = await page.context().newPage();
  await signIn(agent, 'auditor');
  await agent.goto(`${site().mgmtUrl}/sales`);
  await expect(agent.getByRole('heading', { name: /sales|bookings/i }).first()).toBeVisible();
  await expect(agent.getByRole('button', { name: 'New booking' })).toHaveCount(0);
});
