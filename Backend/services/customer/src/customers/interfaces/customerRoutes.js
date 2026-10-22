import express from 'express';
import { actorFrom, pageResponse } from '@estateops/platform';
import {
  createCustomerRequest,
  listCustomersQuery,
  toCustomerFields,
  toCustomerResponse,
  updateCustomerRequest,
} from './customer.dto.js';

export function createCustomerRoutes(uc) {
  const router = express.Router();
  const one = async (req, id) =>
    toCustomerResponse(await uc.getCustomer.execute({ actor: actorFrom(req), id }));

  router.get('/customers', async (req, res) => {
    const { has_overdue: hasOverdue, ...rest } = listCustomersQuery.parse(req.query);
    res.json(
      pageResponse(
        await uc.listCustomers.execute({
          actor: actorFrom(req),
          hasOverdue: hasOverdue === 'true',
          ...rest,
        }),
        toCustomerResponse,
      ),
    );
  });
  router.post('/customers', async (req, res) => {
    const body = createCustomerRequest.parse(req.body);
    const created = await uc.createCustomer.execute({
      actor: actorFrom(req),
      ...toCustomerFields(body),
    });
    res.status(201).json(await one(req, created.id));
  });
  router.get('/customers/:id', async (req, res) => {
    res.json(await one(req, req.params.id));
  });
  router.patch('/customers/:id', async (req, res) => {
    const body = updateCustomerRequest.parse(req.body);
    await uc.updateCustomer.execute({
      actor: actorFrom(req),
      id: req.params.id,
      patch: toCustomerFields(body),
    });
    res.json(await one(req, req.params.id));
  });
  router.delete('/customers/:id', async (req, res) => {
    await uc.deleteCustomer.execute({ actor: actorFrom(req), id: req.params.id });
    res.status(204).end();
  });
  return router;
}
