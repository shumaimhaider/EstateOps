import { expect, test } from '@playwright/test';
import { TEST_CARDS } from '../../Backend/packages/mock-providers/src/index.js';
import { site } from '../support/env.js';
import { A, eventually, world } from '../support/api.js';
import { payWithCard, staffSignIn } from '../support/pages.js';
import { watchContract } from '../support/watch.js';

let w;
let t;

test.beforeAll(async () => {
  w = world();
  t = await w.tenantWithStaff({ roles: ['finance', 'sales_agent'] });
});

/** A fresh booking with its schedule, so each test pays its own invoices. */
async function booking(opts = {}) {
  const s = await w.seedSales(t.owner, { price: 400_000_00, downPct: 25, installments: 3, ...opts });
  const b = await w.book(t.owner, s);
  const invoices = await w.invoicesOf(t.owner, b.id);
  return { s, b, invoices };
}

async function openRecordDialog(page, booking, invoice) {
  await page.goto(`${site().mgmtUrl}/sales/${booking.id}`);
  const table = page.getByRole('table', { name: 'Scheduled invoices' });
  await table.getByRole('button', { name: `Record payment ${invoice.invoice_no}` }).click();
  return page.getByRole('dialog', { name: 'Record payment' });
}

test('finance marks a part payment received by hand, then the rest, and a receipt is issued', async ({ page }) => {
  const watch = watchContract(page);
  const { b, invoices } = await booking();
  await staffSignIn(page, site().mgmtUrl, { email: t.logins.finance.email, secret: t.logins.finance.secret });

  let dialog = await openRecordDialog(page, b, invoices[0]);
  await dialog.getByLabel(/Amount/).fill('30000');
  await dialog.getByLabel('Method').selectOption('bank_transfer');
  await dialog.getByLabel('Payment reference (optional)').fill(`UI-${invoices[0].id.slice(0, 8)}`);
  await dialog.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByText(`Payment recorded for ${invoices[0].invoice_no}`)).toBeVisible();

  const after = await t.owner.get(`${A}/installments/${invoices[0].id}`);
  expect(after).toMatchObject({ paid_amount: 30_000_00, method: 'bank_transfer' });

  dialog = await openRecordDialog(page, b, invoices[0]);
  await dialog.getByRole('button', { name: 'Record payment' }).click(); // the form defaults to the full balance
  await expect(page.getByText(/Payment recorded/)).toBeVisible();
  const paid = await t.owner.get(`${A}/installments/${invoices[0].id}`);
  expect(paid).toMatchObject({ status: 'paid', balance: 0 });
  expect(paid.receipt_no).toMatch(/^RCT-/);
  // the receipt column is off by default in the schedule: switch it on from the column chooser
  await page.locator('summary', { hasText: 'Columns' }).first().click();
  await page.getByLabel('Receipt').check();
  await expect(page.getByText(paid.receipt_no).first()).toBeVisible();
  watch.assertClean('hand payment');
});

test('the form refuses an amount above the balance, and the server never sees it', async ({ page }) => {
  const { b, invoices } = await booking();
  await staffSignIn(page, site().mgmtUrl, { email: t.logins.finance.email, secret: t.logins.finance.secret });
  const dialog = await openRecordDialog(page, b, invoices[0]);
  await dialog.getByLabel(/Amount/).fill('99999999');
  await dialog.getByRole('button', { name: 'Record payment' }).click();
  await expect(dialog.getByText('Enter an amount up to the outstanding balance')).toBeVisible();
  expect((await t.owner.get(`${A}/installments/${invoices[0].id}`)).paid_amount).toBe(0);
});

test('a card payment on Stripe’s form records the payment, with the ledger showing the transaction', async ({ page }) => {
  const watch = watchContract(page);
  const { b, invoices } = await booking();
  await staffSignIn(page, site().mgmtUrl, { email: t.logins.finance.email, secret: t.logins.finance.secret });
  const dialog = await openRecordDialog(page, b, invoices[0]);
  await dialog.getByLabel('Pay by card (Stripe form)').check();
  await dialog.getByRole('button', { name: 'Continue to card form' }).click();
  const form = dialog.getByRole('form', { name: 'Pay by card' });
  await payWithCard(form, TEST_CARDS.VISA);
  await expect(dialog.getByText(/Payment received/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();

  const invoice = await eventually(async () => {
    const i = await t.owner.get(`${A}/installments/${invoices[0].id}`);
    return i.status === 'paid' ? i : null;
  }, { what: 'invoice paid' });
  expect(invoice.payment_source).toBe('stripe');

  await page.goto(`${site().mgmtUrl}/payments/transactions`);
  await expect(page.getByRole('table').getByText('Paid', { exact: true })).toBeVisible();
  await expect(page.getByRole('table').getByText('visa •••• 4242')).toBeVisible();
  watch.assertClean('card payment');
});

test('a declined card leaves the invoice untouched and says why', async ({ page }) => {
  const { b, invoices } = await booking();
  await staffSignIn(page, site().mgmtUrl, { email: t.logins.finance.email, secret: t.logins.finance.secret });
  const dialog = await openRecordDialog(page, b, invoices[0]);
  await dialog.getByLabel('Pay by card (Stripe form)').check();
  await dialog.getByRole('button', { name: 'Continue to card form' }).click();
  await payWithCard(dialog.getByRole('form', { name: 'Pay by card' }), TEST_CARDS.DECLINED);
  await expect(dialog.getByRole('alert')).toContainText(/declined/i);
  expect((await t.owner.get(`${A}/installments/${invoices[0].id}`)).paid_amount).toBe(0);
});

test('a sales agent can see the schedule but has no way to take payment', async ({ page }) => {
  const { b, invoices } = await booking();
  await staffSignIn(page, site().mgmtUrl, { email: t.logins.sales_agent.email, secret: t.logins.sales_agent.secret });
  await page.goto(`${site().mgmtUrl}/sales/${b.id}`);
  await expect(page.getByText(invoices[0].invoice_no).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Record payment/ })).toHaveCount(0);
});
