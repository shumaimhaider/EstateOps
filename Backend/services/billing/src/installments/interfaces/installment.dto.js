import { z } from 'zod';
import { toIso } from '@estateops/kernel';

const optInt = z.number().int().nullable().optional();

export const listInstallmentsQuery = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  booking_id: z.string().optional(),
  customer_id: z.string().optional(),
  project_id: z.string().optional(),
  unit_kind: z.string().optional(),
  due_from: z.string().optional(),
  due_to: z.string().optional(),
  sort: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.string().optional(),
});

export const payRequest = z.object({
  method: z.string().optional(),
  amount: optInt,
  reference: z.string().nullable().optional(),
  received_on: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  adjusted_amount: optInt,
  adjustment_reason: z.string().nullable().optional(),
});

export const intentRequest = z.object({
  amount: optInt,
  adjusted_amount: optInt,
  adjustment_reason: z.string().nullable().optional(),
});
export const cardPaymentRequest = z.object({
  payment_intent_id: z.string().min(1, 'Payment is required'),
});
export const confirmCardRequest = z.object({
  client_secret: z.string(),
  card: z.object({ number: z.string(), expiry: z.string(), cvc: z.string() }),
});

/** Wire request -> the domain's camelCase input. `null` means "not sent", like an absent field. */
export const toPaymentInput = (b) => ({
  method: b.method,
  amount: b.amount ?? undefined,
  reference: b.reference ?? undefined,
  receivedOn: b.received_on ?? undefined,
  note: b.note ?? undefined,
  adjustedAmount: b.adjusted_amount ?? undefined,
  adjustmentReason: b.adjustment_reason ?? undefined,
});

export const toIntentInput = (b) => ({
  amount: b.amount ?? undefined,
  adjustedAmount: b.adjusted_amount ?? undefined,
  adjustmentReason: b.adjustment_reason ?? undefined,
});

/** One invoice in the shape the UI parses: balance, days late and allowed actions are worked out by the server. */
export function toInstallmentResponse(row, tenantId) {
  const i = row.invoice;
  return {
    id: i.id,
    tenant_id: tenantId,
    booking_id: i.bookingId,
    invoice_no: i.invoiceNo,
    seq: i.seq,
    kind: i.kind,
    unit_no: row.unitNo,
    unit_kind: i.unitKind,
    project_name: row.projectName,
    buyer_name: row.buyerName,
    issued_on: i.issuedOn,
    due_date: i.dueDate,
    amount: i.amount,
    original_amount: i.originalAmount,
    adjustment_reason: i.adjustmentReason,
    paid_amount: i.paidAmount,
    balance: row.balance,
    fine_amount: i.fineAmount,
    currency: row.currency,
    status: i.status,
    days_late: row.daysLate,
    paid_at: toIso(i.paidAt),
    method: i.method,
    payment_source: i.paymentSource,
    received_on: i.receivedOn,
    payment_reference: i.paymentReference,
    receipt_no: i.receiptNo,
    allowed_actions: row.allowedActions,
    created_at: toIso(i.createdAt),
    updated_at: toIso(i.updatedAt),
  };
}

export const toPaymentResponse = (p) => ({
  id: p.id,
  installment_id: p.installmentId,
  amount: p.amount,
  method: p.method,
  source: p.source,
  reference: p.reference,
  received_on: p.receivedOn,
  note: p.note,
  recorded_by_name: p.recordedByName,
  created_at: toIso(p.createdAt),
});

export const toIntentResponse = (i) => ({
  payment_intent_id: i.providerId,
  client_secret: i.clientSecret,
  amount: i.amount,
  currency: i.currency,
  status: i.status,
});
