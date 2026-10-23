import express from 'express';
import { WebhookSignatureError } from '../application/esignPort.js';

/**
 * PandaDoc's webhook endpoint. The body is signed with the shared key and the signature arrives in
 * the `signature` query value; it is checked over the raw bytes before anything is read. A bad
 * signature is refused with 400. A good body is applied event by event; failures answer 500 so
 * PandaDoc retries.
 */
export function createPandaDocWebhookRoutes({ esign, applyProviderEvents, logger }) {
  const router = express.Router();
  router.post('/pandadoc', async (req, res) => {
    let events;
    try {
      events = esign.verifyWebhook(
        req.rawBody ?? Buffer.alloc(0),
        String(req.query.signature ?? ''),
      );
    } catch (error) {
      if (error instanceof WebhookSignatureError) {
        logger.warn({ reason: error.message }, 'pandadoc webhook refused');
        return res
          .status(400)
          .json({ code: 'BAD_SIGNATURE', message: 'Signature check failed', details: [] });
      }
      throw error;
    }
    const outcomes = await applyProviderEvents.execute(events);
    return res.json({
      received: true,
      applied: outcomes.filter((o) => o.outcome === 'applied').length,
    });
  });
  return router;
}
