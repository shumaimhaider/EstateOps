import { expect, test } from '@playwright/test';
import { site } from '../support/env.js';
import { world } from '../support/api.js';
import { staffSignIn } from '../support/pages.js';

let t;
test.beforeAll(async () => {
  t = await world().createTenant();
});

test('staff sign in with password and authenticator code, and see their developer', async ({ page }) => {
  await staffSignIn(page, site().mgmtUrl, { email: t.ownerEmail, secret: t.ownerSecret });
  await expect(page.getByText(`Developer ${t.slug}`).first()).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Daily collection' })).toBeVisible();
});

test('a wrong password is refused with a message, a wrong code too', async ({ page }) => {
  await page.goto(`${site().mgmtUrl}/login`);
  await page.getByLabel('Email').fill(t.ownerEmail);
  await page.getByLabel('Password').fill('not-the-password-1');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();

  await page.getByLabel('Password').fill('Str0ng-pass-e2e');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Verification code').fill('000000');
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('a signed-out visitor is sent to sign in, and signing out ends the session', async ({ page }) => {
  await page.goto(`${site().mgmtUrl}/inventory/units`);
  await expect(page).toHaveURL(/\/login/);
  await staffSignIn(page, site().mgmtUrl, { email: t.ownerEmail, secret: t.ownerSecret });
  await page.goto(`${site().mgmtUrl}/inventory/units`);
  await expect(page.getByRole('heading', { name: /units/i }).first()).toBeVisible();
  // a reload keeps the session (refresh token), sign out then really ends it
  await page.reload();
  await expect(page.getByRole('heading', { name: /units/i }).first()).toBeVisible();
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto(`${site().mgmtUrl}/inventory/units`);
  await expect(page).toHaveURL(/\/login/);
});
