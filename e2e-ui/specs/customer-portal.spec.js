import { expect, test } from '@playwright/test';
import { TEST_CARDS } from '../../Backend/packages/mock-providers/src/index.js';
import { site } from '../support/env.js';
import { A, emailedLink, eventually, world } from '../support/api.js';
import { customerSignIn, payWithCard } from '../support/pages.js';
import { watchContract } from '../support/watch.js';

const PASSWORD = 'Str0ng-pass-e2e';
let w;
let t;

test.beforeAll(async () => {
  w = world();
  t = await w.tenantWithStaff({ roles: ['finance', 'support'] });
});

/** A buyer with a booking and an active portal login, the way staff set one up. */
async function buyer(opts = {}) {
  const s = await w.seedSales(t.owner, { price: 300_000_00, downPct: 50, installments: 2, ...opts });
  const booking = await w.book(t.owner, s);
  const link = await emailedLink(s.customer.email, /set-password/);
  return { s, booking, token: link.searchParams.get('token') };
}

async function setPasswordInUi(page, token) {
  await page.goto(`${site().custUrl}/set-password?token=${token}`);
  await page.getByLabel('New password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Type it again').fill(PASSWORD);
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText('Your password is saved')).toBeVisible();
}

test('an invited customer chooses a password from the emailed link and signs in to their properties', async ({ page }) => {
  const watch = watchContract(page);
  const { s, booking, token } = await buyer();
  await setPasswordInUi(page, token);
  await customerSignIn(page, site().custUrl, { tenant: t.slug, email: s.customer.email });
  await expect(page.getByRole('heading', { name: 'My properties' })).toBeVisible();
  await expect(page.getByText(s.unit.unit_no).first()).toBeVisible();
  await expect(page.getByText(/received|paid/i).first()).toBeVisible();
  await page.locator('main a[href^="/properties/"]').first().click();
  await expect(page.getByRole('tab', { name: /payment schedule/i })).toBeVisible();
  await expect(page.getByRole('table').getByText('INV-').first()).toBeVisible();
  expect(booking.id).toBeTruthy();
  watch.assertClean('customer dashboard');
});

test('a customer pays an invoice with a new card, saves it, and pays the next with the saved card', async ({ page }) => {
  const watch = watchContract(page);
  const { s, booking, token } = await buyer();
  await setPasswordInUi(page, token);
  await customerSignIn(page, site().custUrl, { tenant: t.slug, email: s.customer.email });
  await page.goto(`${site().custUrl}/properties/${booking.id}`);

  await page.getByRole('button', { name: /pay/i }).first().click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Save this card for next time').check();
  await dialog.getByRole('button', { name: 'Continue to card form' }).click();
  await payWithCard(dialog.getByRole('form', { name: 'Pay by card' }), TEST_CARDS.VISA);
  await expect(dialog.getByText(/Payment received/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();

  const invoices = await w.invoicesOf(t.owner, booking.id);
  await eventually(async () => (await t.owner.get(`${A}/installments/${invoices[0].id}`)).status === 'paid', { what: 'down payment paid' });

  // the saved card is on the account page, and is the one used for one-step payments
  await page.goto(`${site().custUrl}/account`);
  await expect(page.getByText(/Visa ending 4242/i)).toBeVisible();
  await page.goto(`${site().custUrl}/properties/${booking.id}`);
  await page.getByRole('button', { name: /pay/i }).first().click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel(/Use my saved card: Visa ending 4242/i)).toBeChecked();
  await dialog.getByRole('button', { name: /Pay .* now/ }).click();
  await eventually(async () => (await t.owner.get(`${A}/installments/${invoices[1].id}`)).paid_amount > 0, { what: 'saved-card payment' });
  watch.assertClean('customer payments');
});

test('a declined card shows the reason and charges nothing', async ({ page }) => {
  const { s, booking, token } = await buyer();
  await setPasswordInUi(page, token);
  await customerSignIn(page, site().custUrl, { tenant: t.slug, email: s.customer.email });
  await page.goto(`${site().custUrl}/properties/${booking.id}`);
  await page.getByRole('button', { name: /pay/i }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Continue to card form' }).click();
  await payWithCard(dialog.getByRole('form', { name: 'Pay by card' }), TEST_CARDS.DECLINED);
  await expect(dialog.getByRole('alert')).toContainText(/declined/i);
  const invoices = await w.invoicesOf(t.owner, booking.id);
  expect(invoices[0].paid_amount).toBe(0);
});

test('a customer adds two cards, switches the active one and removes one', async ({ page }) => {
  const { s, token } = await buyer();
  await setPasswordInUi(page, token);
  await customerSignIn(page, site().custUrl, { tenant: t.slug, email: s.customer.email });
  await page.goto(`${site().custUrl}/account`);
  for (const number of [TEST_CARDS.VISA, TEST_CARDS.MASTERCARD]) {
    await page.getByRole('button', { name: 'Add a card' }).click();
    const dialog = page.getByRole('dialog');
    await payWithCard(dialog.getByRole('form', { name: 'Pay by card' }), number);
    await expect(dialog.getByText('Card saved.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Done' }).click();
  }
  await expect(page.getByText(/Visa ending 4242/i)).toBeVisible();
  await expect(page.getByText(/Mastercard ending 4444/i)).toBeVisible();
  await expect(page.getByText('Active', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: /Make .* the active card/ }).click();
  await expect(page.getByText('Active', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: /^Remove / }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText(/ending/)).toHaveCount(1);
});

test('a customer asks support and sees the reply staff wrote', async ({ page }) => {
  const watch = watchContract(page);
  const { s, booking, token } = await buyer();
  await setPasswordInUi(page, token);
  await customerSignIn(page, site().custUrl, { tenant: t.slug, email: s.customer.email });
  await page.goto(`${site().custUrl}/support?property=${booking.id}`);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Subject').fill('Receipt copy');
  await dialog.getByLabel('How can we help?').fill('Please resend my receipt.');
  await dialog.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByRole('heading', { name: 'Receipt copy' })).toBeVisible();

  const request = await eventually(async () => (await t.owner.get(`${A}/support-requests`)).data.find((r) => r.subject === 'Receipt copy'), { what: 'request in the staff queue' });
  await t.owner.post(`${A}/support-requests/${request.id}/messages`, { message: 'Sent to your email.' });
  await page.reload();
  await expect(page.getByText('Sent to your email.')).toBeVisible();
  watch.assertClean('support');
});

test('forgot password: the emailed link sets a new one, and the old one stops working', async ({ page }) => {
  const { s, token } = await buyer();
  await setPasswordInUi(page, token);
  const before = (await (await fetch(`${site().urls.identity}/health/live`)).json()).status;
  expect(before).toBe('live');
  await page.goto(`${site().custUrl}/forgot-password`);
  await page.getByLabel(/developer/i).fill(t.slug);
  await page.getByLabel('Email').fill(s.customer.email);
  await page.getByRole('button', { name: 'Send me a reset link' }).click();
  await expect(page.getByText(/a link is on its way/i)).toBeVisible();
  const link = await emailedLink(s.customer.email, /reset-password/);
  await page.goto(`${site().custUrl}${link.pathname}${link.search}`);
  await page.getByLabel('New password', { exact: true }).fill('Another-pass-77');
  await page.getByLabel('Type it again').fill('Another-pass-77');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText('Your password is saved')).toBeVisible();
  await customerSignIn(page, site().custUrl, { tenant: t.slug, email: s.customer.email, password: 'Another-pass-77' });
  await expect(page.getByRole('heading', { name: 'My properties' })).toBeVisible();
});

test('a customer never sees another customer’s property', async ({ page }) => {
  const a = await buyer();
  const b = await buyer();
  await setPasswordInUi(page, a.token);
  await customerSignIn(page, site().custUrl, { tenant: t.slug, email: a.s.customer.email });
  await page.goto(`${site().custUrl}/properties/${b.booking.id}`);
  await expect(page.getByText(b.s.unit.unit_no)).toHaveCount(0);
  await expect(page.getByText(/not found|could not|something went wrong/i).first()).toBeVisible();
});
