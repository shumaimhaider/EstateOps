import { z } from 'zod';

/**
 * The ONLY module that reads import.meta.env. Validated once at startup; a bad
 * value fails loudly here instead of surfacing as a confusing runtime error.
 */
const envSchema = z.object({
  VITE_API_TRANSPORT: z.enum(['rest', 'graphql']).default('rest'),
  VITE_API_BASE_URL: z.string().min(1).default('/api/v1'),
  VITE_GRAPHQL_URL: z.string().min(1).default('/graphql'),
  // Google Identity Services client id.
  VITE_GOOGLE_CLIENT_ID: z.string().default(''),
  // Stripe publishable key. The API also sends it with each checkout.
  VITE_STRIPE_PUBLISHABLE_KEY: z.string().default(''),
  // 'stand_in' shows our own card form instead of Stripe's: for a stand-in Stripe server (tests, demos)
  VITE_STRIPE_UI: z.enum(['auto', 'stand_in']).default('auto'),
  VITE_STRIPE_API_URL: z.string().min(1).default('/stripe/v1'),
});

const parsed = envSchema.safeParse(import.meta.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${z.prettifyError(parsed.error)}`);
}

export const config = Object.freeze({
  apiTransport: parsed.data.VITE_API_TRANSPORT,
  apiBaseUrl: parsed.data.VITE_API_BASE_URL,
  graphqlUrl: parsed.data.VITE_GRAPHQL_URL,
  googleClientId: parsed.data.VITE_GOOGLE_CLIENT_ID,
  stripePublishableKey: parsed.data.VITE_STRIPE_PUBLISHABLE_KEY,
  stripeApiUrl: parsed.data.VITE_STRIPE_API_URL,
  standInStripe: parsed.data.VITE_STRIPE_UI === 'stand_in',
});
