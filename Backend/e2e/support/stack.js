import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import {
  createMockPandaDoc,
  createMockS3,
  createMockStripe,
  listen,
} from '@estateops/mock-providers';
import { createTestDatabase } from '../../packages/platform/src/testing/pgTestDb.js';
import { generateTestKeys } from '../../packages/platform/src/testing/keys.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SERVICES = ['identity', 'inventory', 'customer', 'sales', 'billing', 'contract'];

export const SECRETS = Object.freeze({
  internalToken: 'e2e-internal-token',
  bootstrapToken: 'e2e-bootstrap-token',
  stripeSecret: 'sk_test_e2e',
  stripePublishable: 'pk_test_e2e',
  stripeWebhook: 'whsec_e2e',
  pandaKey: 'pandadoc_e2e_key',
  pandaShared: 'pandadoc_e2e_shared',
});
const TEMPLATES = [
  { id: 'tpl-sale-agreement', name: 'Sale agreement' },
  { id: 'tpl-payment-plan-addendum', name: 'Payment plan addendum' },
];

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

async function waitReady(url, child, name, timeoutMs = 45_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (child.exitCode !== null)
      throw new Error(`${name} exited with code ${child.exitCode} while starting`);
    try {
      if ((await fetch(`${url}/health/ready`)).ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`${name} was not ready after ${timeoutMs} ms`);
}

/**
 * Starts the whole system for a test run: six services and the gateway as REAL processes, each on
 * its own freshly migrated database, plus the mock Stripe and mock PandaDoc servers. Optional
 * infrastructure comes from the environment: E2E_REDIS_URL (cache + shared rate limits) and
 * E2E_KAFKA_BROKERS (switches the event transport to Kafka). Without them: HTTP events, no Redis.
 *
 * `stop()` kills every process and drops every database this run created.
 */
export async function startStack({
  collectionRunAt = '23:59',
  env: extraEnv = {},
  serviceEnv = {},
} = {}) {
  const keys = await generateTestKeys();
  const databases = {};
  const ports = {};
  const urls = {};
  for (const s of [...SERVICES, 'gateway']) {
    ports[s] = await freePort();
    urls[s] = `http://127.0.0.1:${ports[s]}`;
  }
  await Promise.all(
    SERVICES.map(async (s) => {
      databases[s] = await createTestDatabase({ services: [s] });
    }),
  );

  const kafka = process.env.E2E_KAFKA_BROKERS;
  const redisUrl = process.env.E2E_REDIS_URL;

  // The providers call back into our webhooks, through the gateway like the real ones would.
  const stripe = createMockStripe({
    secretKey: SECRETS.stripeSecret,
    webhookSecret: SECRETS.stripeWebhook,
    webhookUrl: `${urls.gateway}/webhooks/stripe`,
  });
  const pandadoc = createMockPandaDoc({
    apiKey: SECRETS.pandaKey,
    sharedKey: SECRETS.pandaShared,
    webhookUrl: `${urls.gateway}/webhooks/pandadoc`,
    templates: TEMPLATES,
  });
  const s3 = createMockS3({
    bucket: 'estateops',
    accessKeyId: 'e2e-access',
    secretAccessKey: 'e2e-secret',
  });
  const s3Server = await listen(s3.app);
  const stripeServer = await listen(stripe.app);
  const pandaServer = await listen(pandadoc.app);

  const subscribers = (self) =>
    SERVICES.filter((s) => s !== self)
      .map((s) => `${s}=${urls[s]}`)
      .concat(`${self}=${urls[self]}`)
      .join(',');
  const base = (service) => ({
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'info',
    PORT: String(ports[service]),
    DATABASE_URL: databases[service]?.url ?? '',
    DB_POOL_SIZE: '5',
    JWT_PUBLIC_KEY: keys.publicPem,
    JWT_PRIVATE_KEY: keys.privatePem,
    INTERNAL_TOKEN: SECRETS.internalToken,
    EVENT_SUBSCRIBERS: subscribers(service),
    RELAY_POLL_MS: '100',
    ...(kafka
      ? { EVENT_TRANSPORT: 'kafka', KAFKA_BROKERS: kafka, KAFKA_CLIENT_ID: `e2e-${service}` }
      : { EVENT_TRANSPORT: 'http' }),
    ...(redisUrl ? { REDIS_URL: redisUrl } : {}),
    ...extraEnv,
  });
  const specific = {
    identity: {
      BOOTSTRAP_TOKEN: SECRETS.bootstrapToken,
      CUSTOMER_PORTAL_URL: 'http://portal.e2e.test',
    },
    inventory: {
      STORAGE_DRIVER: 's3',
      S3_BUCKET: 'estateops',
      S3_ENDPOINT: s3Server.url,
      S3_ACCESS_KEY_ID: 'e2e-access',
      S3_SECRET_ACCESS_KEY: 'e2e-secret',
      // the only place that decides where files are served from
      STORAGE_PUBLIC_BASE_URL: `${s3Server.url}/estateops`,
    },
    customer: { SUPPORT_EMAIL: 'support@developer.e2e.test' },
    sales: { SAGA_TIMEOUT_MS: '600000', BILLING_URL: urls.billing },
    billing: {
      STRIPE_SECRET_KEY: SECRETS.stripeSecret,
      STRIPE_PUBLISHABLE_KEY: SECRETS.stripePublishable,
      STRIPE_WEBHOOK_SECRET: SECRETS.stripeWebhook,
      STRIPE_API_BASE: stripeServer.url,
      COLLECTION_RUN_AT: collectionRunAt,
    },
    contract: {
      STORAGE_DIR: fileURLToPath(new URL(`../.tmp/contracts-${process.pid}`, import.meta.url)),
      PANDADOC_API_KEY: SECRETS.pandaKey,
      PANDADOC_WEBHOOK_KEY: SECRETS.pandaShared,
      PANDADOC_TEMPLATE_SALE_AGREEMENT: 'tpl-sale-agreement',
      PANDADOC_TEMPLATE_PAYMENT_PLAN: 'tpl-payment-plan-addendum',
      PANDADOC_API_BASE: pandaServer.url,
      PANDADOC_SESSION_BASE: `${pandaServer.url}/s`,
    },
    gateway: {
      DATABASE_URL: undefined,
      RATE_LIMIT_PER_USER_PER_MINUTE: '100000',
      RATE_LIMIT_PER_ADDRESS_PER_MINUTE: '100000',
      ...Object.fromEntries(SERVICES.map((s) => [`UPSTREAM_${s.toUpperCase()}`, urls[s]])),
    },
  };

  const children = [];
  const logs = [];
  const mails = [];
  const start = (service) => {
    const entry =
      service === 'gateway'
        ? 'services/gateway/src/main/server.js'
        : `services/${service}/src/main/server.js`;
    const child = spawn(process.execPath, [entry], {
      cwd: ROOT,
      env: { ...base(service), ...specific[service], ...serviceEnv[service] },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const onLine = (line) => {
      logs.push(`[${service}] ${line}`);
      if (logs.length > 4000) logs.shift();
      try {
        const rec = JSON.parse(line);
        if (rec.msg === 'email (not sent: console mailer)')
          mails.push({ service, to: rec.to, subject: rec.subject, text: rec.text, at: Date.now() });
      } catch {
        /* not a JSON log line */
      }
    };
    for (const stream of [child.stdout, child.stderr]) {
      let rest = '';
      stream.on('data', (chunk) => {
        rest += chunk;
        const lines = rest.split('\n');
        rest = lines.pop();
        lines.forEach(onLine);
      });
    }
    children.push({ service, child });
    return child;
  };

  const down = new Set();
  /** Kills one service (a crash or an outage). Its database stays; the others keep running. */
  const kill = async (service) => {
    const entry = children.findLast((c) => c.service === service);
    if (!entry || entry.child.exitCode !== null) return;
    down.add(service);
    await new Promise((resolve) => {
      entry.child.once('exit', resolve);
      entry.child.kill('SIGKILL');
    });
  };
  /** Starts a killed service again on the same port and database, and waits until it is ready. */
  const revive = async (service) => {
    const child = start(service);
    await waitReady(urls[service], child, service);
    down.delete(service);
  };

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    for (const { child } of children) child.kill('SIGTERM');
    await Promise.all(
      children.map(
        ({ child }) =>
          new Promise((resolve) => {
            if (child.exitCode !== null) return resolve();
            const timer = setTimeout(() => {
              child.kill('SIGKILL');
              resolve();
            }, 5_000);
            child.once('exit', () => {
              clearTimeout(timer);
              resolve();
            });
          }),
      ),
    );
    await stripeServer.close();
    await pandaServer.close();
    await s3Server.close();
    await Promise.all(Object.values(databases).map((d) => d.drop().catch(() => {})));
  };

  try {
    // services first (they need their database only), the gateway last
    const started = SERVICES.map((s) => [s, start(s)]);
    await Promise.all(started.map(([s, child]) => waitReady(urls[s], child, s)));
    const gw = start('gateway');
    await waitReady(urls.gateway, gw, 'gateway');
  } catch (error) {
    const tail = logs.slice(-60).join('\n');
    await stop();
    throw new Error(`${error.message}\n--- last log lines ---\n${tail}`);
  }

  return {
    urls,
    gatewayUrl: urls.gateway,
    databases: Object.fromEntries(Object.entries(databases).map(([k, v]) => [k, v.url])),
    stripe: { ...stripe, url: stripeServer.url },
    pandadoc: { ...pandadoc, url: pandaServer.url },
    s3: { ...s3, url: s3Server.url },
    kafka: Boolean(kafka),
    redis: Boolean(redisUrl),
    mails,
    logs,
    kill,
    revive,
    /** Last log lines of every process: print when a journey fails. */
    tail: (n = 80) => logs.slice(-n).join('\n'),
    stop,
  };
}
