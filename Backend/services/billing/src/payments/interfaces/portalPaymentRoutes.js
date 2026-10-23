import express from 'express';
import { decodeCursor, encodeCursor, toIso } from '@estateops/kernel';
import { customerFrom, pageResponse } from '@estateops/platform';
import {
  chargeSavedCardRequest,
  checkoutRequest,
  listTransactionsQuery,
  toCheckoutInput,
  toCheckoutResponse,
  toCheckoutStatusResponse,
  toPaymentMethodResponse,
} from './payment.dto.js';

/** What a customer sees of an invoice: amounts and dates, never staff or Stripe internals. */
export const toPortalInvoiceResponse = ({ invoice: i, currency, balance, daysLate, payable }) => ({
  id: i.id,
  invoice_no: i.invoiceNo,
  kind: i.kind,
  seq: i.seq,
  status: i.status,
  issued_on: i.issuedOn,
  due_date: i.dueDate,
  amount: i.amount,
  paid_amount: i.paidAmount,
  balance,
  fine_amount: i.fineAmount,
  currency,
  days_late: daysLate,
  paid_at: toIso(i.paidAt),
  receipt_no: i.receiptNo,
  payable,
});

const toPortalTransactionResponse = (t) => ({
  id: t.id,
  invoice_id: t.installmentId,
  booking_id: t.bookingId,
  trigger: t.trigger,
  amount: t.amount,
  currency: t.currency,
  status: t.status,
  card_brand: t.cardBrand,
  card_last4: t.cardLast4,
  failure_message: t.failureMessage,
  created_at: toIso(t.createdAt),
  completed_at: t.completedAt ? toIso(t.completedAt) : null,
});

/**
 * The customer portal's money API. The customer comes from the token, never from the URL: the
 * customer paying through these routes is always the one signed in, and an actor carrying
 * `customerId` makes the shared use cases refuse anything that is not theirs.
 */
export function createPortalPaymentRoutes(uc) {
  const router = express.Router();
  /** The signed-in customer as the payment use cases' actor. They can pay and keep cards, nothing else. */
  const payer = (req) => ({ ...customerFrom(req), permissions: ['payments.card'] });

  router.get('/properties/:bookingId/invoices', async (req, res) => {
    const items = await uc.listMyInvoices.execute({
      customer: customerFrom(req),
      bookingId: req.params.bookingId,
    });
    res.json({ data: items.map(toPortalInvoiceResponse), next_cursor: null });
  });

  router.post('/invoices/:id/checkout-session', async (req, res) => {
    const input = toCheckoutInput(checkoutRequest.parse(req.body ?? {}));
    res
      .status(201)
      .json(
        toCheckoutResponse(
          await uc.createCheckoutSession.execute({ actor: payer(req), id: req.params.id, input }),
        ),
      );
  });
  router.get('/checkout-sessions/:id', async (req, res) => {
    const status = await uc.getCheckoutSession.execute({ actor: payer(req), id: req.params.id });
    res.json({
      ...toCheckoutStatusResponse(status),
      transaction: status.transaction ? toPortalTransactionResponse(status.transaction) : null,
    });
  });
  router.post('/invoices/:id/charge-saved-card', async (req, res) => {
    const input = toCheckoutInput(chargeSavedCardRequest.parse(req.body ?? {}));
    const result = await uc.chargeSavedCard.execute({
      actor: payer(req),
      id: req.params.id,
      input,
      trigger: 'customer_saved_card',
      attemptKey: req.get('idempotency-key') ?? req.id,
    });
    res.status(201).json(toPortalTransactionResponse(result.transaction));
  });

  router.get('/payment-methods', async (req, res) => {
    const me = payer(req);
    const methods = await uc.listPaymentMethods.execute({ actor: me, customerId: me.customerId });
    res.json({ data: methods.map(toPaymentMethodResponse), next_cursor: null });
  });
  router.post('/payment-methods/setup-session', async (req, res) => {
    const me = payer(req);
    res
      .status(201)
      .json(
        toCheckoutResponse(
          await uc.createCardSetupSession.execute({ actor: me, customerId: me.customerId }),
        ),
      );
  });
  router.post('/payment-methods/:id/activate', async (req, res) => {
    const me = payer(req);
    res.json(
      toPaymentMethodResponse(
        await uc.setActivePaymentMethod.execute({
          actor: me,
          customerId: me.customerId,
          id: req.params.id,
        }),
      ),
    );
  });
  router.delete('/payment-methods/:id', async (req, res) => {
    const me = payer(req);
    await uc.removePaymentMethod.execute({
      actor: me,
      customerId: me.customerId,
      id: req.params.id,
    });
    res.status(204).end();
  });

  router.get('/transactions', async (req, res) => {
    const q = listTransactionsQuery.parse(req.query);
    const page = await uc.listMyTransactions.execute({
      customer: customerFrom(req),
      bookingId: q.booking_id,
      installmentId: q.invoice_id ?? q.installment_id,
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
        toPortalTransactionResponse,
      ),
    );
  });
  return router;
}
