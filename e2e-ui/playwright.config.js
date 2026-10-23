import { defineConfig } from '@playwright/test';

/**
 * The portals in a real browser against the real back end: six services and the gateway as
 * processes, per-run databases (dropped afterwards), stand-in Stripe, PandaDoc and S3.
 * Needs TEST_DATABASE_URL (a local PostgreSQL test server). Run: npm test
 *
 * Journeys run once at desktop size. responsive.spec.js runs at phone, tablet and desktop widths.
 */
const SIZES = {
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 820, height: 1180 }, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 } },
};

export default defineConfig({
  testDir: './specs',
  globalSetup: './support/globalSetup.js',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 3,
  reporter: [['list']],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'journeys', testIgnore: /responsive\.spec/, use: SIZES.desktop },
    ...Object.entries(SIZES).map(([name, use]) => ({ name: `responsive-${name}`, testMatch: /responsive\.spec/, use })),
  ],
});
