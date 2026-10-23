import { expect } from '@playwright/test';
import { totp } from './api.js';

/** Staff sign-in through the real two-step form. */
export async function staffSignIn(page, baseUrl, { email, secret, password = 'Str0ng-pass-e2e' }) {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Verification code').fill(totp.code(secret));
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Customer sign-in through the portal's form. */
export async function customerSignIn(page, baseUrl, { tenant, email, password = 'Str0ng-pass-e2e' }) {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel(/developer/i).fill(tenant);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Types a card into the (stand-in) Stripe form and pays. */
export async function payWithCard(scope, number, { expiry = '12/39', cvc = '123' } = {}) {
  await scope.getByLabel('Card number').fill(number);
  await scope.getByLabel('Expiry (MM/YY)').fill(expiry);
  await scope.getByLabel('Security code (CVC)').fill(cvc);
  await scope.getByRole('button', { name: /^Pay/ }).click();
}
