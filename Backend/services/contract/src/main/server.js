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
  createTypeormUow,
  loadConfig,
  startService,
} from '@estateops/platform';
import { createPandaDocClient } from '../contracts/infrastructure/PandaDocClient.js';
import { createLocalFileStore } from '../contracts/infrastructure/LocalFileStore.js';
import { composeContract } from './compose.js';
import { ENTITIES, buildRepos } from './repos.js';

const SCHEMA = 'contract';
const config = loadConfig(
  process.env,
  z.object({
    ...EVENT_TRANSPORT_ENV,
    PORT: z.coerce.number().default(8106),
    STORAGE_DIR: z.string().default('./storage'),
    // PandaDoc keys are pasted into the environment, never committed
    PANDADOC_API_KEY: z.string().min(1),
    PANDADOC_WEBHOOK_KEY: z.string().min(1),
    PANDADOC_TEMPLATE_SALE_AGREEMENT: z.string().min(1),
    PANDADOC_TEMPLATE_PAYMENT_PLAN: z.string().min(1),
    // only for a mock PandaDoc in development and tests; leave unset for the real API
    PANDADOC_API_BASE: z.string().default('https://api.pandadoc.com'),
    PANDADOC_SESSION_BASE: z.string().default('https://app.pandadoc.com/s'),
  }),
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
  esign: createPandaDocClient({
    apiKey: config.PANDADOC_API_KEY,
    sharedKey: config.PANDADOC_WEBHOOK_KEY,
    baseUrl: config.PANDADOC_API_BASE,
    sessionBaseUrl: config.PANDADOC_SESSION_BASE,
    templates: {
      sale_agreement: config.PANDADOC_TEMPLATE_SALE_AGREEMENT,
      payment_plan_addendum: config.PANDADOC_TEMPLATE_PAYMENT_PLAN,
    },
  }),
  verifier: await createJwtVerifier({ publicKeyPem: config.jwtPublicKey }),
  logger,
  internalToken: config.INTERNAL_TOKEN,
  idempotencyStore: createIdempotencyStore(dataSource, { schema: SCHEMA }),
  readyCheck: () => dataSource.query('SELECT 1'),
  mockSigner: !config.isProduction,
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
