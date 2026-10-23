import { z } from 'zod';
import { systemClock } from '@estateops/kernel';
import {
  CACHE_ENV,
  connect,
  createCacheFromConfig,
  createDataSource,
  createIdempotencyStore,
  createInterval,
  createJwtVerifier,
  createLogger,
  EVENT_TRANSPORT_ENV,
  createDailyJob,
  createEventTransport,
  createTypeormUow,
  loadConfig,
  startService,
  createConsoleMailer,
  createSmtpMailer,
} from '@estateops/platform';
import { createStripeGateway } from '../payments/infrastructure/StripeGateway.js';
import { composeBilling } from './compose.js';
import { ENTITIES, buildRepos } from './repos.js';

const SCHEMA = 'billing';
const config = loadConfig(
  process.env,
  z.object({
    ...EVENT_TRANSPORT_ENV,
    ...CACHE_ENV,
    PORT: z.coerce.number().default(8105),
    SWEEP_EVERY_MS: z.coerce.number().default(15 * 60_000),
    // Stripe keys are pasted into the environment, never committed (see env.example)
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_PUBLISHABLE_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET: z.string().min(1),
    // only for a mock Stripe in development and tests; leave unset for the real API
    STRIPE_API_BASE: z.string().optional(),
    // where Stripe sends the browser after the embedded form; {CHECKOUT_ID} becomes our checkout id
    // email to customers about card charges: SMTP in production, printed to the log in development
    SMTP_URL: z.string().optional(),
    MAIL_FROM: z.string().default('EstateOps <no-reply@estateops.example>'),
    // the daily collection scan, "HH:MM" UTC; set COLLECTION_ENABLED=false to turn automatic charging off
    COLLECTION_ENABLED: z.enum(['true', 'false']).default('true'),
    COLLECTION_RUN_AT: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .default('06:00'),
    STRIPE_RETURN_URL: z
      .string()
      .default('http://localhost:5173/payments/return?checkout={CHECKOUT_ID}'),
  }),
);
const logger = createLogger({ name: SCHEMA, level: config.LOG_LEVEL });

const connectTo = (url) =>
  connect(createDataSource({ url, entities: ENTITIES, poolSize: config.DB_POOL_SIZE }));
const dataSource = await connectTo(config.DATABASE_URL);
const readDataSource = config.READ_DATABASE_URL ? await connectTo(config.READ_DATABASE_URL) : null;

const uow = createTypeormUow({ dataSource, readDataSource, schema: SCHEMA, buildRepos });

const app = composeBilling({
  uow,
  clock: systemClock,
  gateway: createStripeGateway({
    secretKey: config.STRIPE_SECRET_KEY,
    webhookSecret: config.STRIPE_WEBHOOK_SECRET,
    apiBase: config.STRIPE_API_BASE,
  }),
  cache: config.REDIS_URL ? createCacheFromConfig(config, { logger }) : undefined,
  mailer: config.SMTP_URL
    ? createSmtpMailer({ url: config.SMTP_URL, from: config.MAIL_FROM })
    : createConsoleMailer({ logger }),
  stripe: { publishableKey: config.STRIPE_PUBLISHABLE_KEY, returnUrl: config.STRIPE_RETURN_URL },
  verifier: await createJwtVerifier({ publicKeyPem: config.jwtPublicKey }),
  logger,
  internalToken: config.INTERNAL_TOKEN,
  idempotencyStore: createIdempotencyStore(dataSource, { schema: SCHEMA }),
  readyCheck: () => dataSource.query('SELECT 1'),
});

const transport = createEventTransport({
  config,
  service: SCHEMA,
  dataSource,
  schema: SCHEMA,
  handlers: app.handlers,
  logger,
});
await transport.start();

startService({
  app,
  port: config.PORT,
  logger,
  workers: [
    ...(config.COLLECTION_ENABLED === 'true'
      ? [
          createDailyJob({
            name: 'collect-due-invoices',
            at: config.COLLECTION_RUN_AT,
            run: () => app.collectDueInvoices.execute(),
            claim: (date) => uow.run((repos) => repos.jobRuns.claim('collect', date)),
            finish: (date, outcome) =>
              uow.run((repos) => repos.jobRuns.finish('collect', date, outcome)),
            release: (date) => uow.run((repos) => repos.jobRuns.release('collect', date)),
            logger,
          }),
        ]
      : []),
    ...transport.workers,
    createInterval({
      name: 'status-sweep',
      fn: () => app.sweepStatuses.execute(),
      everyMs: config.SWEEP_EVERY_MS,
      logger,
    }),
  ],
  onShutdown: async () => {
    await transport.stop();
    await dataSource.destroy();
  },
});
