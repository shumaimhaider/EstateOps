import { money } from '../../lib/money.js';

export const runFromApi = (d) => ({
  runDate: d.run_date,
  startedAt: d.started_at,
  finishedAt: d.finished_at,
  error: d.error,
  invoices: d.invoices,
  succeeded: d.succeeded,
  failed: d.failed,
  refunded: d.refunded,
  skipped: d.skipped,
  waiting: d.waiting,
  collected: d.currency ? money(d.collected_amount, d.currency) : null,
  failedAmount: d.currency ? money(d.failed_amount, d.currency) : null,
  currency: d.currency,
});

export const attemptFromApi = (d) => ({
  id: d.id,
  invoiceId: d.invoice_id,
  invoiceNo: d.invoice_no,
  dueDate: d.due_date,
  bookingId: d.booking_id,
  customerId: d.customer_id,
  customerName: d.customer_name,
  unitNo: d.unit_no,
  projectName: d.project_name,
  attemptNo: d.attempt_no,
  reason: d.reason,
  amount: money(d.amount, d.currency),
  status: d.status,
  category: d.category,
  funds: d.funds,
  summary: d.summary,
  stripeCode: d.stripe_code,
  stripeMessage: d.stripe_message,
  cardBrand: d.card_brand,
  cardLast4: d.card_last4,
  paymentIntentId: d.stripe_payment_intent_id,
  transactionId: d.transaction_id,
  willRetry: d.will_retry,
  retryOn: d.retry_on,
  finishedAt: d.finished_at,
});

export const attemptsFiltersToApi = ({ status, after, limit } = {}) => ({
  status: status || undefined,
  after: after || undefined,
  limit,
});
