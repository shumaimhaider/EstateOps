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
import { composeCustomer } from './compose.js';
import { ENTITIES, buildRepos } from './repos.js';

const SCHEMA = 'customer';
const config = loadConfig(process.env, z.object({ PORT: z.coerce.number().default(8103) }));
const logger = createLogger({ name: SCHEMA, level: config.LOG_LEVEL });

const connectTo = (url) =>
  connect(createDataSource({ url, entities: ENTITIES, poolSize: config.DB_POOL_SIZE }));
const dataSource = await connectTo(config.DATABASE_URL);
const readDataSource = config.READ_DATABASE_URL ? await connectTo(config.READ_DATABASE_URL) : null;

const app = composeCustomer({
  uow: createTypeormUow({ dataSource, readDataSource, schema: SCHEMA, buildRepos }),
  clock: systemClock,
  verifier: await createJwtVerifier({ publicKeyPem: config.jwtPublicKey }),
  logger,
  internalToken: config.INTERNAL_TOKEN,
  idempotencyStore: createIdempotencyStore(dataSource, { schema: SCHEMA }),
  readyCheck: () => dataSource.query('SELECT 1'),
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
  ],
  onShutdown: () => dataSource.destroy(),
});
