import express from 'express';
import { actorFrom, pageResponse } from '@estateops/platform';
import {
  cardPaymentRequest,
  confirmCardRequest,
  intentRequest,
  listInstallmentsQuery,
  payRequest,
  toInstallmentResponse,
  toIntentInput,
  toIntentResponse,
  toPaymentInput,
  toPaymentResponse,
} from './installment.dto.js';

/**
 * Invoices and taking payment. After every write the invoice is read back, so the response is
 * exactly what the register shows (balance, days late and allowed actions included).
 */
export function createInstallmentRoutes(uc, { mockCard = false } = {}) {
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
  router.post('/installments/:id/payment-intents', async (req, res) => {
    const input = toIntentInput(intentRequest.parse(req.body ?? {}));
    res.status(201).json(
      toIntentResponse(
        await uc.createCardPaymentIntent.execute({
          actor: actorFrom(req),
          id: req.params.id,
          input,
        }),
      ),
    );
  });
  router.post('/installments/:id/card-payments', async (req, res) => {
    const { payment_intent_id: providerId } = cardPaymentRequest.parse(req.body);
    await uc.recordCardPayment.execute({ actor: actorFrom(req), id: req.params.id, providerId });
    res.json(await one(req, req.params.id));
  });
  for (const action of ['waive', 'cancel']) {
    router.post(`/installments/:id/${action}`, async (req, res) => {
      await uc.changeInvoiceStatus.execute({ actor: actorFrom(req), id: req.params.id, action });
      res.json(await one(req, req.params.id));
    });
  }

  if (mockCard) {
    // Development only: stands in for the browser confirming the card with the provider.
    router.post('/mock/payment-intents/:providerId/confirm', async (req, res) => {
      const body = confirmCardRequest.parse(req.body);
      const result = await uc.confirmMockCardPayment.execute({
        actor: actorFrom(req),
        providerId: req.params.providerId,
        clientSecret: body.client_secret,
        card: body.card,
      });
      res.status(result.status).json(result.body);
    });
  }
  return router;
}
