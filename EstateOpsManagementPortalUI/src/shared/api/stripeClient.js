import { config } from '@/shared/config/config.js';
import { ApiError, fromNetworkError } from './ApiError.js';

/**
 * Card confirmation goes straight to Stripe, never through our API, so card numbers never reach
 * our servers. This is deliberately a plain fetch with no auth header: our access token must not
 * be sent to Stripe. In mock mode the request is answered by the mock Stripe; real mode needs
 * Stripe.js Elements with the publishable key (not wired yet).
 * @param {{ clientSecret: string, card: { number: string, expiry: string, cvc: string } }} p
 * @returns {Promise<{ id: string, status: string, charge: { id: string, last4: string } }>}
 */
export async function confirmCardPayment({ clientSecret, card }) {
  if (!config.isMock) {
    throw new ApiError({
      code: 'STRIPE_NOT_CONFIGURED',
      message: 'Card payments need Stripe.js with VITE_STRIPE_PUBLISHABLE_KEY.',
    });
  }
  const intentId = clientSecret.split('_secret_')[0];
  let response;
  try {
    response = await fetch(`${config.stripeApiUrl}/payment_intents/${intentId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_secret: clientSecret, card }),
    });
  } catch (cause) {
    throw fromNetworkError(cause);
  }
  const json = await response.json();
  if (!response.ok) {
    const { code, message } = json.error ?? {};
    throw new ApiError({
      code: code ?? 'STRIPE_ERROR',
      message: message ?? 'The card payment failed',
      status: response.status,
    });
  }
  return json;
}
