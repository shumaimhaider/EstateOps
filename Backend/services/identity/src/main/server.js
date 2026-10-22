import { z } from 'zod';
import {
  connect,
  createDataSource,
  createIdempotencyStore,
  createInterval,
  createJwtSigner,
  createJwtVerifier,
  createLogger,
  createOutboxStore,
  createRelay,
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
