import { z } from 'zod';
import { systemClock } from '@estateops/kernel';
import {
  CACHE_ENV,
  connect,
  createCacheFromConfig,
  createDataSource,
  createIdempotencyStore,
  createJwtVerifier,
  createLogger,
  EVENT_TRANSPORT_ENV,
  createEventTransport,
  STORAGE_ENV,
  createFilesKit,
  createTypeormUow,
  loadConfig,
  startService,
} from '@estateops/platform';
import { composeInventory } from './compose.js';
import { ENTITIES, buildRepos } from './repos.js';

const SCHEMA = 'inventory';
const config = loadConfig(
  process.env,
  z.object({
    ...EVENT_TRANSPORT_ENV,
    ...CACHE_ENV,
    PORT: z.coerce.number().default(8102),
    ...STORAGE_ENV,
  }),
);
const logger = createLogger({ name: SCHEMA, level: config.LOG_LEVEL });

const connectTo = (url) =>
  connect(createDataSource({ url, entities: ENTITIES, poolSize: config.DB_POOL_SIZE }));
const dataSource = await connectTo(config.DATABASE_URL);
const readDataSource = config.READ_DATABASE_URL ? await connectTo(config.READ_DATABASE_URL) : null;

const app = composeInventory({
  uow: createTypeormUow({ dataSource, readDataSource, schema: SCHEMA, buildRepos }),
  clock: systemClock,
  verifier: await createJwtVerifier({ publicKeyPem: config.jwtPublicKey }),
  logger,
  internalToken: config.INTERNAL_TOKEN,
  idempotencyStore: createIdempotencyStore(dataSource, { schema: SCHEMA }),
  readyCheck: () => dataSource.query('SELECT 1'),
  files: createFilesKit(config),
  cache: config.REDIS_URL ? createCacheFromConfig(config, { logger }) : undefined,
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
  workers: [...transport.workers],
  onShutdown: async () => {
    await transport.stop();
    await dataSource.destroy();
  },
});
