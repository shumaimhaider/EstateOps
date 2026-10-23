import { z } from 'zod';
import { systemClock } from '@estateops/kernel';
import {
  connect,
  createDataSource,
  createIdempotencyStore,
  createJwtVerifier,
  createLogger,
  EVENT_TRANSPORT_ENV,
  createEventTransport,
  createInterval,
  createTypeormUow,
  loadConfig,
  startService,
} from '@estateops/platform';
import { createBillingPaymentsClient } from '../bookings/infrastructure/BillingPaymentsClient.js';
import { composeSales } from './compose.js';
import { ENTITIES, buildRepos } from './repos.js';

const SCHEMA = 'sales';
const config = loadConfig(
  process.env,
  z.object({
    ...EVENT_TRANSPORT_ENV,
    PORT: z.coerce.number().default(8104),
    SAGA_TIMEOUT_MS: z.coerce.number().default(10 * 60_000),
    SAGA_SWEEP_MS: z.coerce.number().default(60_000),
    // billing's address: asked whether a booking has payments before it is cancelled
    BILLING_URL: z.string().url().optional(),
  }),
);
const logger = createLogger({ name: SCHEMA, level: config.LOG_LEVEL });

const connectTo = (url) =>
  connect(createDataSource({ url, entities: ENTITIES, poolSize: config.DB_POOL_SIZE }));
const dataSource = await connectTo(config.DATABASE_URL);
const readDataSource = config.READ_DATABASE_URL ? await connectTo(config.READ_DATABASE_URL) : null;

const app = composeSales({
  uow: createTypeormUow({ dataSource, readDataSource, schema: SCHEMA, buildRepos }),
  clock: systemClock,
  verifier: await createJwtVerifier({ publicKeyPem: config.jwtPublicKey }),
  logger,
  internalToken: config.INTERNAL_TOKEN,
  idempotencyStore: createIdempotencyStore(dataSource, { schema: SCHEMA }),
  readyCheck: () => dataSource.query('SELECT 1'),
  sagaTimeoutMs: config.SAGA_TIMEOUT_MS,
  payments: config.BILLING_URL
    ? createBillingPaymentsClient({
        baseUrl: config.BILLING_URL,
        internalToken: config.INTERNAL_TOKEN,
      })
    : null,
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
    ...transport.workers,
    createInterval({
      name: 'saga-timeout',
      fn: () => app.sweepStuckBookings.execute(),
      everyMs: config.SAGA_SWEEP_MS,
      logger,
    }),
  ],
  onShutdown: async () => {
    await transport.stop();
    await dataSource.destroy();
  },
});
