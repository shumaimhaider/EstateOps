import { z } from 'zod';
import { systemClock } from '@estateops/kernel';
import {
  connect,
  createConsoleMailer,
  createSmtpMailer,
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
import { composeCustomer } from './compose.js';
import { ENTITIES, buildRepos } from './repos.js';

const SCHEMA = 'customer';
const config = loadConfig(
  process.env,
  z.object({
    ...EVENT_TRANSPORT_ENV,
    PORT: z.coerce.number().default(8103),
    SMTP_URL: z.string().optional(),
    MAIL_FROM: z.string().default('EstateOps <no-reply@estateops.example>'),
    // where customers' support requests are announced by email (the queue in the portal always has them)
    SUPPORT_EMAIL: z.string().email().optional(),
  }),
);
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
  mailer: config.SMTP_URL
    ? createSmtpMailer({ url: config.SMTP_URL, from: config.MAIL_FROM })
    : createConsoleMailer({ logger }),
  supportEmail: config.SUPPORT_EMAIL,
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
