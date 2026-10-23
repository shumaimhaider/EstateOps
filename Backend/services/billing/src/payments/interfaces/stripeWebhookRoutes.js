import express from 'express';
import { WebhookSignatureError } from '../application/stripeGatewayPort.js';

/**
 * Stripe's webhook endpoint. The signature is checked over the raw body; a bad one is refused with
 * 400 and nothing is stored. A good event is processed once (repeats answer 200 at once). A failure
 * answers 500 so Stripe retries later.
 */
export function createStripeWebhookRoutes({ gateway, handleStripeEvent, logger }) {
  const router = express.Router();
  router.post('/stripe', async (req, res) => {
    let event;
    try {
      event = gateway.verifyWebhook(
        req.rawBody ?? Buffer.alloc(0),
        req.get('stripe-signature') ?? '',
      );
    } catch (error) {
      if (error instanceof WebhookSignatureError) {
        logger.warn({ reason: error.message }, 'stripe webhook refused');
        return res
          .status(400)
          .json({ code: 'BAD_SIGNATURE', message: 'Signature check failed', details: [] });
      }
      throw error;
    }
    const result = await handleStripeEvent.execute(event);
    return res.json({ received: true, duplicate: Boolean(result.duplicate) });
  });
  return router;
}
