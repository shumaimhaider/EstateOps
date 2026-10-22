import express from 'express';
import { parseEvent } from '@estateops/contracts';

/**
 * Receives events at POST /events (mounted under /internal). Unknown or unhandled event types
 * are acknowledged so the sender stops retrying them; a handler that throws returns 500 so the
 * sender retries later. `handlers`: { [eventType]: async (event) => ({ duplicate }) | void }.
 */
export function createEventConsumerRouter({ handlers, logger }) {
  const router = express.Router();
  router.post('/events', async (req, res) => {
    const parsed = parseEvent(req.body);
    if (!parsed.ok) {
      if (parsed.unknown) return res.status(202).json({ ignored: true });
      return res.status(400).json({ code: 'BAD_EVENT', message: parsed.error, details: [] });
    }
    const handler = handlers[parsed.event.type];
    if (!handler) return res.status(202).json({ ignored: true });
    const result = await handler(parsed.event);
    logger.debug({ type: parsed.event.type, id: parsed.event.id }, 'event handled');
    return res.json({ ok: true, duplicate: Boolean(result?.duplicate) });
  });
  return router;
}
