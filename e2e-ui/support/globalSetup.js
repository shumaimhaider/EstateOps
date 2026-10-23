import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dropRunDatabases, dropStaleTestDatabases, postgresAvailable } from '../../Backend/packages/platform/src/testing/pgTestDb.js';
import { startStack } from '../../Backend/e2e/support/stack.js';
import { serveSite } from './sites.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const out = fileURLToPath(new URL('../.run/', import.meta.url));

/** Build a portal for the real API, with the stand-in Stripe form (the stand-in Stripe server has no Stripe.js). */
function build(app, dist) {
  execFileSync('npx', ['vite', 'build', '--outDir', dist, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: `${root}${app}`,
    stdio: 'inherit',
    env: { ...process.env, VITE_API_BASE_URL: '/api/v1', VITE_STRIPE_UI: 'stand_in', VITE_STRIPE_API_URL: '/stripe/v1' },
  });
}

let stack;
let sites = [];
let runId;

export default async function globalSetup() {
  runId = randomBytes(4).toString('hex');
  process.env.ESTATEOPS_TEST_RUN_ID = runId;
  if (!(await postgresAvailable())) throw new Error('Set TEST_DATABASE_URL to a local PostgreSQL test server');
  await dropStaleTestDatabases();

  mkdirSync(out, { recursive: true });
  build('EstateOpsManagementPortalUI', `${out}mgmt`);
  build('EstateOpsCustomerPortalUI', `${out}cust`);

  stack = await startStack();
  const mgmt = await serveSite({ dist: `${out}mgmt`, gatewayUrl: stack.gatewayUrl, stripeUrl: stack.stripe.url });
  const cust = await serveSite({ dist: `${out}cust`, gatewayUrl: stack.gatewayUrl, stripeUrl: stack.stripe.url });
  sites = [mgmt, cust];

  // the specs run in other processes: they learn where everything is from this file
  const config = {
    mgmtUrl: mgmt.url,
    custUrl: cust.url,
    gatewayUrl: stack.gatewayUrl,
    urls: stack.urls,
    stripeUrl: stack.stripe.url,
    pandadocUrl: stack.pandadoc.url,
    s3Url: stack.s3.url,
    databases: stack.databases,
  };
  writeFileSync(`${out}stack.json`, JSON.stringify(config));
  // mails are only in this process: expose them over a tiny local endpoint
  const { createServer } = await import('node:http');
  const mailServer = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(stack.mails));
  });
  await new Promise((r) => mailServer.listen(0, '127.0.0.1', r));
  process.env.UI_E2E_MAIL_URL = `http://127.0.0.1:${mailServer.address().port}`;
  writeFileSync(`${out}mail.json`, JSON.stringify({ url: process.env.UI_E2E_MAIL_URL }));

  return async () => {
    mailServer.close();
    await Promise.all(sites.map((s) => s.close()));
    await stack.stop();
    await dropRunDatabases(runId);
  };
}
