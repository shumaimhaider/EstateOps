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
import { createFakeESignProvider } from '../contracts/infrastructure/FakeESignProvider.js';
import { createLocalFileStore } from '../contracts/infrastructure/LocalFileStore.js';
import { composeContract } from './compose.js';
import { ENTITIES, buildRepos } from './repos.js';

const SCHEMA = 'contract';
const config = loadConfig(
  process.env,
  z.object({ PORT: z.coerce.number().default(8106), STORAGE_DIR: z.string().default('./storage') }),
);
const logger = createLogger({ name: SCHEMA, level: config.LOG_LEVEL });

const connectTo = (url) =>
  connect(createDataSource({ url, entities: ENTITIES, poolSize: config.DB_POOL_SIZE }));
const dataSource = await connectTo(config.DATABASE_URL);
const readDataSource = config.READ_DATABASE_URL ? await connectTo(config.READ_DATABASE_URL) : null;

const app = composeContract({
  uow: createTypeormUow({ dataSource, readDataSource, schema: SCHEMA, buildRepos }),
  clock: systemClock,
  files: createLocalFileStore(config.STORAGE_DIR), // replaced by an object-storage adapter later
  esign: createFakeESignProvider(), // replaced by the PandaDoc adapter later
  verifier: await createJwtVerifier({ publicKeyPem: config.jwtPublicKey }),
  logger,
  internalToken: config.INTERNAL_TOKEN,
  idempotencyStore: createIdempotencyStore(dataSource, { schema: SCHEMA }),
  readyCheck: () => dataSource.query('SELECT 1'),
  mockSigner: !config.isProduction,
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
