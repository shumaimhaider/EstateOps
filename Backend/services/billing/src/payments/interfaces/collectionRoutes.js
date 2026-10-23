import express from 'express';
import { z } from 'zod';
import { toIso } from '@estateops/kernel';
import { actorFrom } from '@estateops/platform';

const date = z.union([
  z.literal('today'),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-23'),
]);
const daysQuery = z.object({
  before: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(62).optional(),
});
const STATUSES = ['queued', 'in_progress', 'succeeded', 'failed', 'refunded', 'skipped'];
const attemptsQuery = z.object({
  status: z.enum(STATUSES).optional(),
  after: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const toRunResponse = (d) => ({
  run_date: d.runDate,
  started_at: d.startedAt ? toIso(d.startedAt) : null,
  finished_at: d.finishedAt ? toIso(d.finishedAt) : null,
  error: d.error,
  invoices: d.total,
  succeeded: d.succeeded,
  failed: d.failed,
  refunded: d.refunded,
  skipped: d.skipped,
  waiting: d.waiting,
  collected_amount: d.collected,
  failed_amount: d.failedAmount,
  currency: d.currency,
});

export const toAttemptResponse = (a) => ({
  id: a.id,
  invoice_id: a.invoiceId,
  invoice_no: a.invoiceNo,
  due_date: a.dueDate,
  booking_id: a.bookingId,
  customer_id: a.customerId,
  customer_name: a.customerName,
  unit_no: a.unitNo,
  project_name: a.projectName,
  attempt_no: a.attemptNo,
  reason: a.reason,
  amount: a.amount,
  currency: a.currency,
  status: a.status,
  category: a.category,
  funds: a.funds,
  summary: a.summary,
  stripe_code: a.failureCode,
  stripe_message: a.failureMessage,
  card_brand: a.cardBrand,
  card_last4: a.cardLast4,
  stripe_payment_intent_id: a.stripePaymentIntentId,
  transaction_id: a.transactionId,
  will_retry: a.willRetry,
  retry_on: a.retryOn,
  finished_at: a.finishedAt ? toIso(a.finishedAt) : null,
});

/** The automatic collection's history, day by day (finance and anyone who may see collection figures). */
export function createCollectionRoutes(uc) {
  const router = express.Router();
  router.get('/collection-runs', async (req, res) => {
    const q = daysQuery.parse(req.query);
    const page = await uc.listCollectionRuns.execute({
      actor: actorFrom(req),
      before: q.before,
      limit: q.limit,
    });
    res.json({ data: page.items.map(toRunResponse), next_before: page.nextBefore });
  });
  router.get('/collection-runs/:date', async (req, res) => {
    const q = attemptsQuery.parse(req.query);
    const page = await uc.listCollectionAttempts.execute({
      actor: actorFrom(req),
      runDate: date.parse(req.params.date),
      status: q.status ?? null,
      after: q.after ?? null,
      limit: q.limit,
    });
    res.json({
      data: page.items.map(toAttemptResponse),
      next_after: page.nextAfter,
      summary: page.summary ? toRunResponse(page.summary) : null,
    });
  });
  return router;
}
