import express from 'express';
import { actorFrom, pageResponse } from '@estateops/platform';
import {
  effectiveQuery,
  saveFineRuleRequest,
  toEffectiveResponse,
  toRuleResponse,
} from './fineRule.dto.js';

export function createFineRuleRoutes(uc) {
  const router = express.Router();

  router.get('/fine-rules', async (req, res) => {
    res.json(
      pageResponse(await uc.listFineRules.execute({ actor: actorFrom(req) }), (r) =>
        toRuleResponse(r, req.auth.tenantId),
      ),
    );
  });
  router.get('/fine-rules/effective', async (req, res) => {
    const q = effectiveQuery.parse(req.query);
    const effective = await uc.getEffectiveFineRule.execute({
      actor: actorFrom(req),
      scope: q.scope,
      scopeId: q.scope_id ?? null,
      unitKind: q.unit_kind ?? null,
    });
    res.json(toEffectiveResponse(effective, req.auth.tenantId));
  });
  router.put('/fine-rules', async (req, res) => {
    const b = saveFineRuleRequest.parse(req.body);
    const saved = await uc.saveFineRule.execute({
      actor: actorFrom(req),
      scope: b.scope,
      scopeId: b.scope_id ?? null,
      unitKind: b.unit_kind ?? null,
      kind: b.kind,
      value: b.value,
    });
    res.json(toRuleResponse(saved, req.auth.tenantId));
  });
  router.delete('/fine-rules/:id', async (req, res) => {
    await uc.deleteFineRule.execute({ actor: actorFrom(req), id: req.params.id });
    res.json({ ok: true });
  });
  return router;
}
