import { expect, test } from '@playwright/test';
import { site } from '../support/env.js';
import { A, emailedLink, eventually, world } from '../support/api.js';
import { customerSignIn, staffSignIn } from '../support/pages.js';
import { watchContract } from '../support/watch.js';

const PASSWORD = 'Str0ng-pass-e2e';
// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
let w;
let t;

test.beforeAll(async () => {
  w = world();
  t = await w.tenantWithStaff({ roles: ['sales_manager', 'inventory_manager'] });
});

test('staff draft and send a contract in the portal; the customer signs it in PandaDoc’s embedded page; both screens show it signed', async ({ page, browser }) => {
  const watch = watchContract(page);
  const s = await w.seedSales(t.owner);
  const booking = await w.book(t.owner, s);
  const invite = await emailedLink(s.customer.email, /set-password/);

  // staff: create the draft from a template and send it
  await staffSignIn(page, site().mgmtUrl, { email: t.logins.sales_manager.email, secret: t.logins.sales_manager.secret });
  await page.goto(`${site().mgmtUrl}/sales/${booking.id}`);
  await page.getByRole('button', { name: 'Create with PandaDoc' }).click();
  const create = page.getByRole('dialog');
  await create.getByLabel('Template').selectOption('sale_agreement');
  await create.getByRole('button', { name: 'Create draft' }).click();
  await page.waitForTimeout(1500);
  watch.assertClean('creating the draft');
  await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Send for signing' }).click();
  await expect(page.getByText('Sent to sign', { exact: true }).first()).toBeVisible();

  // customer: sets a password, signs in and signs on PandaDoc's page inside the portal
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const cust = await ctx.newPage();
  const watchCustomer = watchContract(cust);
  await cust.goto(`${site().custUrl}/set-password?token=${invite.searchParams.get('token')}`);
  await cust.getByLabel('New password', { exact: true }).fill(PASSWORD);
  await cust.getByLabel('Type it again').fill(PASSWORD);
  await cust.getByRole('button', { name: 'Save password' }).click();
  await expect(cust.getByText('Your password is saved')).toBeVisible();
  await customerSignIn(cust, site().custUrl, { tenant: t.slug, email: s.customer.email });
  await cust.goto(`${site().custUrl}/properties/${booking.id}`);
  await cust.getByRole('tab', { name: /contracts/i }).click();
  await expect(cust.getByText('Waiting for you')).toBeVisible();
  await cust.getByRole('button', { name: /review and sign/i }).click();
  const frame = cust.frameLocator('iframe[title="PandaDoc signing page"]');
  await frame.getByRole('button', { name: 'Sign' }).click();
  await expect(cust.getByText(/Your signature was received/)).toBeVisible();
  await cust.getByRole('button', { name: 'Done' }).click();
  // PandaDoc's webhook makes it final; the customer's list catches up and offers the signed copy
  await expect(cust.getByText('Signed', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  const download = cust.waitForEvent('download');
  await cust.getByRole('button', { name: /Download/ }).click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);

  // staff see it signed too, with nothing left to do
  await expect(async () => {
    await page.reload();
    await expect(page.getByText('Signed', { exact: true }).first()).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Send for signing' })).toHaveCount(0);
  watch.assertClean('staff contracts');
  watchCustomer.assertClean('customer contracts');
  await ctx.close();
});

test('staff upload a site map and a unit picture straight to the bucket with signed URLs, and the screens show them', async ({ page }) => {
  const watch = watchContract(page);
  const project = await t.owner.post(`${A}/projects`, { name: 'Upload Tower', kind: 'tower' });
  const unit = await t.owner.post(`${A}/units`, { project_id: project.id, unit_no: 'F-101', kind: 'flat', area_value: 900, area_unit: 'sq_ft', list_price: 5_000_000_00, currency: 'PKR', bedrooms: 2 });
  await staffSignIn(page, site().mgmtUrl, { email: t.logins.inventory_manager.email, secret: t.logins.inventory_manager.secret });

  // the browser must PUT to the bucket itself: watch that it does
  const puts = [];
  page.on('request', (r) => r.method() === 'PUT' && r.url().startsWith(site().s3Url) && puts.push(r.url()));

  await page.goto(`${site().mgmtUrl}/inventory/projects/${project.id}`);
  await page.getByLabel('Site map file').setInputFiles({ name: 'site plan.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: 'Upload site map' }).click();
  await expect(page.getByText('Site map updated')).toBeVisible();
  const map = await t.owner.get(`${A}/projects/${project.id}/map`);
  expect(map.image_url.startsWith(`${site().s3Url}/estateops/${t.tenantId}/`)).toBe(true);
  expect(map.image_name).toBe('site plan.png');

  await page.goto(`${site().mgmtUrl}/inventory/units/${unit.id}`);
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'living room.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: /upload|add/i }).first().click();
  await eventually(async () => ((await t.owner.get(`${A}/units/${unit.id}`)).media ?? []).length > 0, { what: 'picture attached' });
  expect(puts.length).toBeGreaterThanOrEqual(2);
  expect(puts.every((u) => u.includes('X-Amz-Signature'))).toBe(true);
  await page.reload();
  await expect(page.locator(`img[src^="${site().s3Url}/estateops/"]`).first()).toBeVisible();
  watch.assertClean('uploads');
});
