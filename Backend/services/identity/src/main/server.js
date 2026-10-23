import { z } from 'zod';
import {
  CACHE_ENV,
  createConsoleMailer,
  createSmtpMailer,
  connect,
  createCacheFromConfig,
  createDataSource,
  createIdempotencyStore,
  createJwtSigner,
  createJwtVerifier,
  createLogger,
  EVENT_TRANSPORT_ENV,
  createEventTransport,
  createTypeormUow,
  loadConfig,
  startService,
} from '@estateops/platform';
import { systemClock } from '@estateops/kernel';
import { createTotp } from '../auth/infrastructure/totp.js';
import { createTokenService } from '../auth/infrastructure/tokens.js';
import { createScryptHasher } from '../users/infrastructure/scryptHasher.js';
import { composeIdentity } from './compose.js';
import { ENTITIES, buildRepos } from './repos.js';

const SCHEMA = 'identity';

const config = loadConfig(
  process.env,
  z.object({
    ...EVENT_TRANSPORT_ENV,
    ...CACHE_ENV,
    SMTP_URL: z.string().optional(),
    MAIL_FROM: z.string().default('EstateOps <no-reply@estateops.example>'),
    // where the customer portal lives; invitation and reset links point here
    CUSTOMER_PORTAL_URL: z.string().url().default('http://localhost:5174'),
    JWT_PRIVATE_KEY: z.string().min(1),
    BOOTSTRAP_TOKEN: z.string().min(8),
    PORT: z.coerce.number().default(8101),
  }),
);
const logger = createLogger({ name: 'identity', level: config.LOG_LEVEL });

const dataSource = await connect(
  createDataSource({ url: config.DATABASE_URL, entities: ENTITIES, poolSize: config.DB_POOL_SIZE }),
);
const readDataSource = config.READ_DATABASE_URL
  ? await connect(
      createDataSource({
        url: config.READ_DATABASE_URL,
        entities: ENTITIES,
        poolSize: config.DB_POOL_SIZE,
      }),
    )
  : null;

const app = composeIdentity({
  uow: createTypeormUow({ dataSource, readDataSource, schema: SCHEMA, buildRepos }),
  clock: systemClock,
  hasher: createScryptHasher(),
  totp: createTotp(),
  tokens: createTokenService(),
  signer: await createJwtSigner({ privateKeyPem: config.jwtPrivateKey }),
  verifier: await createJwtVerifier({ publicKeyPem: config.jwtPublicKey }),
  logger,
  internalToken: config.INTERNAL_TOKEN,
  bootstrapToken: config.BOOTSTRAP_TOKEN,
  idempotencyStore: createIdempotencyStore(dataSource, { schema: SCHEMA }),
  readyCheck: () => dataSource.query('SELECT 1'),
  mailer: config.SMTP_URL
    ? createSmtpMailer({ url: config.SMTP_URL, from: config.MAIL_FROM })
    : createConsoleMailer({ logger }),
  portalUrl: config.CUSTOMER_PORTAL_URL,
  cache: config.REDIS_URL ? createCacheFromConfig(config, { logger }) : null,
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
