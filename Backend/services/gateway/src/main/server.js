import { z } from 'zod';
import {
  CACHE_ENV,
  createCacheFromConfig,
  createJwtVerifier,
  createLogger,
  startService,
} from '@estateops/platform';

/** The gateway has no database, so it reads its own small set of settings. */
const env = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    PORT: z.coerce.number().int().default(8080),
    JWT_PUBLIC_KEY: z.string().min(1),
    CORS_ORIGINS: z.string().default(''),
    RATE_LIMIT_PER_USER_PER_MINUTE: z.coerce.number().int().positive().default(600),
    RATE_LIMIT_PER_ADDRESS_PER_MINUTE: z.coerce.number().int().positive().default(60),
    ...CACHE_ENV,
    UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    UPSTREAM_IDENTITY: z.string().url(),
    UPSTREAM_INVENTORY: z.string().url(),
    UPSTREAM_CUSTOMER: z.string().url(),
    UPSTREAM_SALES: z.string().url(),
    UPSTREAM_BILLING: z.string().url(),
    UPSTREAM_CONTRACT: z.string().url(),
  })
  .parse(process.env);

const { composeGateway } = await import('./compose.js');
const logger = createLogger({ name: 'gateway', level: env.LOG_LEVEL });

const app = composeGateway({
  upstreams: {
    identity: env.UPSTREAM_IDENTITY,
    inventory: env.UPSTREAM_INVENTORY,
    customer: env.UPSTREAM_CUSTOMER,
    sales: env.UPSTREAM_SALES,
    billing: env.UPSTREAM_BILLING,
    contract: env.UPSTREAM_CONTRACT,
  },
  verifier: await createJwtVerifier({ publicKeyPem: env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n') }),
  logger,
  corsOrigins: env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  perUserPerMinute: env.RATE_LIMIT_PER_USER_PER_MINUTE,
  perAddressPerMinute: env.RATE_LIMIT_PER_ADDRESS_PER_MINUTE,
  upstreamTimeoutMs: env.UPSTREAM_TIMEOUT_MS,
  hsts: env.NODE_ENV === 'production',
  // Redis shares the rate-limit counts between replicas; without REDIS_URL each replica counts alone
  cache: env.REDIS_URL ? createCacheFromConfig(env, { logger }) : null,
});

startService({ app, port: env.PORT, logger });
