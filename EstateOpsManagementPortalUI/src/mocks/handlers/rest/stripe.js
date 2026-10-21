import { http, HttpResponse } from 'msw';
import { getDb, persist } from '../../db/db.js';
import { confirmPaymentIntent } from '../../engine/stripe.js';

/** Stripe's own API (card confirmation), separate from our API and our auth token. */
export const stripeRestHandlers = [
  http.post('*/stripe/v1/payment_intents/:id/confirm', async ({ request, params }) => {
    const { client_secret: clientSecret, card } = await request.json();
    const result = confirmPaymentIntent(getDb(), { intentId: params.id, clientSecret, card });
    persist();
    return HttpResponse.json(result.body, { status: result.status });
  }),
];
