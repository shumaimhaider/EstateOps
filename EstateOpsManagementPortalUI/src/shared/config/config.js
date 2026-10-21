import { z } from 'zod';

/**
 * The ONLY module that reads import.meta.env. Validated once at startup; a bad
 * value fails loudly here instead of surfacing as a confusing runtime error.
 */
const envSchema = z.object({
  VITE_API_MODE: z.enum(['mock', 'real']).default('mock'),
  VITE_API_TRANSPORT: z.enum(['rest', 'graphql']).default('rest'),
  VITE_API_BASE_URL: z.string().min(1).default('/api/v1'),
  VITE_GRAPHQL_URL: z.string().min(1).default('/graphql'),
  // Google Identity Services client id (real mode). Mock mode uses a built-in account chooser.
  VITE_GOOGLE_CLIENT_ID: z.string().default(''),
  // Stripe publishable key (real mode). Mock mode uses a built-in stand-in for Stripe.
  VITE_STRIPE_PUBLISHABLE_KEY: z.string().default(''),
  VITE_STRIPE_API_URL: z.string().min(1).default('/stripe/v1'),
});

const parsed = envSchema.safeParse(import.meta.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${z.prettifyError(parsed.error)}`);
}

export const config = Object.freeze({
  apiMode: parsed.data.VITE_API_MODE,
  apiTransport: parsed.data.VITE_API_TRANSPORT,
  apiBaseUrl: parsed.data.VITE_API_BASE_URL,
  graphqlUrl: parsed.data.VITE_GRAPHQL_URL,
  googleClientId: parsed.data.VITE_GOOGLE_CLIENT_ID,
  stripePublishableKey: parsed.data.VITE_STRIPE_PUBLISHABLE_KEY,
  stripeApiUrl: parsed.data.VITE_STRIPE_API_URL,
  isMock: parsed.data.VITE_API_MODE === 'mock',
});
