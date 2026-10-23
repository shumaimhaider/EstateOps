import express from 'express';
import { actorFrom, pageResponse } from '@estateops/platform';
import {
  listInstallmentsQuery,
  payRequest,
  toInstallmentResponse,
  toPaymentInput,
  toPaymentResponse,
} from './installment.dto.js';

/**
 * Invoices and taking payment. After every write the invoice is read back, so the response is
 * exactly what the register shows (balance, days late and allowed actions included).
 */
export function createInstallmentRoutes(uc) {
  const router = express.Router();
  const one = async (req, id) =>
    toInstallmentResponse(
      await uc.getInstallment.execute({ actor: actorFrom(req), id }),
      req.auth.tenantId,
    );

  router.get('/installments', async (req, res) => {
    const q = listInstallmentsQuery.parse(req.query);
    const page = await uc.listInstallments.execute({
      actor: actorFrom(req),
      q: q.q,
      status: q.status,
      bookingId: q.booking_id,
      customerId: q.customer_id,
      projectId: q.project_id,
      unitKind: q.unit_kind,
      dueFrom: q.due_from,
      dueTo: q.due_to,
      sort: q.sort,
      cursor: q.cursor,
      limit: q.limit,
    });
    res.json(pageResponse(page, (row) => toInstallmentResponse(row, req.auth.tenantId)));
  });
  router.get('/installments/:id', async (req, res) => res.json(await one(req, req.params.id)));
  router.get('/installments/:id/payments', async (req, res) => {
    res.json({
      data: (await uc.listPayments.execute({ actor: actorFrom(req), id: req.params.id })).map(
        toPaymentResponse,
      ),
      next_cursor: null,
    });
  });

  router.post('/installments/:id/pay', async (req, res) => {
    const input = toPaymentInput(payRequest.parse(req.body));
    await uc.recordPayment.execute({ actor: actorFrom(req), id: req.params.id, input });
    res.json(await one(req, req.params.id));
  });
  for (const action of ['waive', 'cancel']) {
    router.post(`/installments/:id/${action}`, async (req, res) => {
      await uc.changeInvoiceStatus.execute({ actor: actorFrom(req), id: req.params.id, action });
      res.json(await one(req, req.params.id));
    });
  }

  return router;
}
