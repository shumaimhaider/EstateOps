import express from 'express';
import { actorFrom, pageResponse } from '@estateops/platform';
import { createPlanRequest, toPlanFields, toPlanResponse, updatePlanRequest } from './plan.dto.js';

export function createPlanRoutes(uc) {
  const router = express.Router();
  const one = async (req, id) =>
    toPlanResponse(await uc.getPlan.execute({ actor: actorFrom(req), id }));

  router.get('/payment-plans', async (req, res) => {
    res.json(pageResponse(await uc.listPlans.execute({ actor: actorFrom(req) }), toPlanResponse));
  });
  router.post('/payment-plans', async (req, res) => {
    const body = createPlanRequest.parse(req.body);
    const plan = await uc.createPlan.execute({ actor: actorFrom(req), ...toPlanFields(body) });
    res.status(201).json(await one(req, plan.id));
  });
  router.get('/payment-plans/:id', async (req, res) => {
    res.json(await one(req, req.params.id));
  });
  router.patch('/payment-plans/:id', async (req, res) => {
    const patch = toPlanFields(updatePlanRequest.parse(req.body));
    await uc.updatePlan.execute({ actor: actorFrom(req), id: req.params.id, patch });
    res.json(await one(req, req.params.id));
  });
  router.delete('/payment-plans/:id', async (req, res) => {
    await uc.deletePlan.execute({ actor: actorFrom(req), id: req.params.id });
    res.status(204).end();
  });
  return router;
}
