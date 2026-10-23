import { z } from 'zod';

/**
 * The ONLY module that reads import.meta.env. Validated once at startup; a bad
 * value fails loudly here instead of surfacing as a confusing runtime error.
 */
const envSchema = z.object({
  VITE_API_BASE_URL: z.string().min(1).default('/api/v1'),
  // Which developer this portal serves (the tenant short name), e.g. "pk". Customers sign in to it.
  VITE_TENANT_SLUG: z.string().default(''),
  // 'stand_in' shows our own card form instead of Stripe's: for a stand-in Stripe server (tests, demos)
  // 'stand_in' shows our own card form even against the real API: for tests with a stand-in Stripe
  VITE_STRIPE_UI: z.enum(['auto', 'stand_in']).default('auto'),
  VITE_STRIPE_API_URL: z.string().min(1).default('/stripe/v1'),
});

const parsed = envSchema.safeParse(import.meta.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${z.prettifyError(parsed.error)}`);
}

export const config = Object.freeze({
  apiBaseUrl: parsed.data.VITE_API_BASE_URL,
  tenantSlug: parsed.data.VITE_TENANT_SLUG,
  stripeApiUrl: parsed.data.VITE_STRIPE_API_URL,
  standInStripe: parsed.data.VITE_STRIPE_UI === 'stand_in',
});
