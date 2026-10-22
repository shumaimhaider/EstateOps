import { z } from 'zod';

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().min(1),
  READ_DATABASE_URL: z.string().optional(),
  DB_POOL_SIZE: z.coerce.number().int().positive().default(10),
  JWT_PUBLIC_KEY: z.string().min(1),
  JWT_PRIVATE_KEY: z.string().optional(),
  INTERNAL_TOKEN: z.string().min(8),
  // "sales=http://localhost:8104,billing=http://localhost:8105"
  EVENT_SUBSCRIBERS: z.string().default(''),
  RELAY_POLL_MS: z.coerce.number().int().positive().default(500),
});

/** Parses subscriber env text into { serviceName: baseUrl }. */
export function parseSubscribers(text) {
  return Object.fromEntries(
    text
      .split(',')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const [name, ...rest] = pair.split('=');
        return [name.trim(), rest.join('=').trim()];
      }),
  );
}

/**
 * The only place environment variables are read. Fails loudly at startup on a bad value.
 * `extra` is a Zod object of service-specific variables.
 */
export function loadConfig(env = process.env, extra = z.object({})) {
  const parsed = baseSchema.extend(extra.shape).safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${z.prettifyError(parsed.error)}`);
  }
  const c = parsed.data;
  return Object.freeze({
    ...c,
    isProduction: c.NODE_ENV === 'production',
    subscribers: parseSubscribers(c.EVENT_SUBSCRIBERS),
    // PEM keys often arrive with literal "\n" in env files
    jwtPublicKey: c.JWT_PUBLIC_KEY.replace(/\\n/g, '\n'),
    jwtPrivateKey: c.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  });
}
