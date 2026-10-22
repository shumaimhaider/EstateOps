import { z } from 'zod';
import { systemClock } from '@estateops/kernel';
import {
  connect,
  createDataSource,
  createIdempotencyStore,
  createInterval,
  createJwtVerifier,
  createLogger,
  createOutboxStore,
  createRelay,
  createTypeormUow,
  loadConfig,
  startService,
} from '@estateops/platform';
import { createFakeCardGateway } from '../installments/infrastructure/FakeCardGateway.js';
import { composeBilling } from './compose.js';
import { ENTITIES, buildRepos } from './repos.js';

const SCHEMA = 'billing';
const config = loadConfig(
  process.env,
  z.object({
    PORT: z.coerce.number().default(8105),
    SWEEP_EVERY_MS: z.coerce.number().default(15 * 60_000),
  }),
);
const logger = createLogger({ name: SCHEMA, level: config.LOG_LEVEL });

const connectTo = (url) =>
  connect(createDataSource({ url, entities: ENTITIES, poolSize: config.DB_POOL_SIZE }));
const dataSource = await connectTo(config.DATABASE_URL);
const readDataSource = config.READ_DATABASE_URL ? await connectTo(config.READ_DATABASE_URL) : null;

const app = composeBilling({
  uow: createTypeormUow({ dataSource, readDataSource, schema: SCHEMA, buildRepos }),
  clock: systemClock,
  gateway: createFakeCardGateway({ clock: systemClock }), // replaced by the Stripe adapter when it exists
  verifier: await createJwtVerifier({ publicKeyPem: config.jwtPublicKey }),
  logger,
  internalToken: config.INTERNAL_TOKEN,
  idempotencyStore: createIdempotencyStore(dataSource, { schema: SCHEMA }),
  readyCheck: () => dataSource.query('SELECT 1'),
  mockCard: !config.isProduction,
});

const relay = createRelay({
  store: createOutboxStore(dataSource, { schema: SCHEMA }),
  subscribers: config.subscribers,
  internalToken: config.INTERNAL_TOKEN,
  logger,
});

startService({
  app,
  port: config.PORT,
  logger,
  workers: [
    createInterval({
      name: 'outbox-relay',
      fn: () => relay.tick(),
      everyMs: config.RELAY_POLL_MS,
      logger,
    }),
    createInterval({
      name: 'status-sweep',
      fn: () => app.sweepStatuses.execute(),
      everyMs: config.SWEEP_EVERY_MS,
      logger,
    }),
  ],
  onShutdown: () => dataSource.destroy(),
});
