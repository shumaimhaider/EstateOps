import express from 'express';
import { z } from 'zod';
import { actorFrom } from '@estateops/platform';

const updateRequest = z.object({ grace_days: z.number(), escalation_missed: z.number() }).strict();
const toResponse = (s) => ({ grace_days: s.graceDays, escalation_missed: s.escalationMissed });

export function createSettingsRoutes(uc) {
  const router = express.Router();
  router.get('/collection-settings', async (req, res) =>
    res.json(toResponse(await uc.getSettings.execute({ actor: actorFrom(req) }))),
  );
  router.put('/collection-settings', async (req, res) => {
    const b = updateRequest.parse(req.body);
    res.json(
      toResponse(
        await uc.updateSettings.execute({
          actor: actorFrom(req),
          input: { graceDays: b.grace_days, escalationMissed: b.escalation_missed },
        }),
      ),
    );
  });
  return router;
}
