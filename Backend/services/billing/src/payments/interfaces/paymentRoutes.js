import express from 'express';
import { decodeCursor, encodeCursor, toIso } from '@estateops/kernel';
import { actorFrom, pageResponse } from '@estateops/platform';
import {
  checkoutRequest,
  chargeSavedCardRequest,
  listTransactionsQuery,
  toCheckoutInput,
  toCheckoutResponse,
  toCheckoutStatusResponse,
  toPaymentMethodResponse,
  toTransactionDetailResponse,
  toTransactionResponse,
} from './payment.dto.js';

/**
 * Taking card payments with Stripe Embedded Checkout, saved cards and the transaction ledger.
 * The browser gets only a client secret; card details go to Stripe and never through here.
 */
export function createPaymentRoutes(uc) {
  const router = express.Router();

  router.post('/installments/:id/checkout-session', async (req, res) => {
    const input = toCheckoutInput(checkoutRequest.parse(req.body ?? {}));
    res.status(201).json(
      toCheckoutResponse(
        await uc.createCheckoutSession.execute({
          actor: actorFrom(req),
          id: req.params.id,
          input,
        }),
      ),
    );
  });
  router.get('/checkout-sessions/:id', async (req, res) => {
    res.json(
      toCheckoutStatusResponse(
        await uc.getCheckoutSession.execute({ actor: actorFrom(req), id: req.params.id }),
      ),
    );
  });
  router.post('/installments/:id/charge-saved-card', async (req, res) => {
    const body = chargeSavedCardRequest.parse(req.body ?? {});
    const key = req.get('idempotency-key') ?? req.id;
    const result = await uc.chargeSavedCard.execute({
      actor: actorFrom(req),
      id: req.params.id,
      input: toCheckoutInput(body),
      attemptKey: key,
    });
    // a declined card is an expected outcome, not a protocol error: the body says what happened
    res.status(201).json(toTransactionResponse(result.transaction));
  });

  router.get('/customers/:customerId/payment-methods', async (req, res) => {
    const methods = await uc.listPaymentMethods.execute({
      actor: actorFrom(req),
      customerId: req.params.customerId,
    });
    res.json({ data: methods.map(toPaymentMethodResponse), next_cursor: null });
  });
  router.post('/customers/:customerId/payment-methods/setup-session', async (req, res) => {
    res.status(201).json(
      toCheckoutResponse(
        await uc.createCardSetupSession.execute({
          actor: actorFrom(req),
          customerId: req.params.customerId,
        }),
      ),
    );
  });
  router.post('/customers/:customerId/payment-methods/:id/activate', async (req, res) => {
    res.json(
      toPaymentMethodResponse(
        await uc.setActivePaymentMethod.execute({
          actor: actorFrom(req),
          customerId: req.params.customerId,
          id: req.params.id,
        }),
      ),
    );
  });
  router.delete('/customers/:customerId/payment-methods/:id', async (req, res) => {
    await uc.removePaymentMethod.execute({
      actor: actorFrom(req),
      customerId: req.params.customerId,
      id: req.params.id,
    });
    res.status(204).end();
  });

  router.get('/transactions', async (req, res) => {
    const q = listTransactionsQuery.parse(req.query);
    const page = await uc.listTransactions.execute({
      actor: actorFrom(req),
      installmentId: q.installment_id,
      customerId: q.customer_id,
      bookingId: q.booking_id,
      status: q.status,
      cursor: q.cursor
        ? { createdAt: decodeCursor(q.cursor).v, id: decodeCursor(q.cursor).id }
        : undefined,
      limit: q.limit ? Math.min(q.limit, 100) : 25,
    });
    res.json(
      pageResponse(
        {
          items: page.items,
          nextCursor: page.next
            ? encodeCursor({ v: toIso(page.next.createdAt), id: page.next.id })
            : null,
        },
        toTransactionResponse,
      ),
    );
  });
  router.get('/transactions/:id', async (req, res) => {
    res.json(
      toTransactionDetailResponse(
        await uc.getTransaction.execute({ actor: actorFrom(req), id: req.params.id }),
      ),
    );
  });
  return router;
}
