import { money } from '../../lib/money.js';

const SORT_TO_WIRE = {
  dueDate: 'due_date',
  amount: 'amount',
  balance: 'balance',
  status: 'status',
  invoiceNo: 'invoice_no',
  sequence: 'seq',
};
const FIELD_TO_WIRE = {
  amount: 'amount',
  method: 'method',
  reference: 'reference',
  receivedOn: 'received_on',
  note: 'note',
  adjustedAmount: 'adjusted_amount',
  adjustmentReason: 'adjustment_reason',
};
const WIRE_TO_FIELD = Object.fromEntries(Object.entries(FIELD_TO_WIRE).map(([k, v]) => [v, k]));

/** @returns {import('../../../features/collections/domain/installment.model.js').Invoice} */
export function fromApi(dto) {
  const c = dto.currency;
  return {
    id: dto.id,
    tenantId: dto.tenant_id,
    bookingId: dto.booking_id,
    invoiceNo: dto.invoice_no,
    sequence: dto.seq,
    kind: dto.kind,
    unitNo: dto.unit_no,
    unitKind: dto.unit_kind,
    projectName: dto.project_name,
    buyerName: dto.buyer_name,
    issuedOn: dto.issued_on,
    dueDate: dto.due_date,
    amount: money(dto.amount, c),
    originalAmount: money(dto.original_amount, c),
    adjustmentReason: dto.adjustment_reason,
    paid: money(dto.paid_amount, c),
    balance: money(dto.balance, c),
    fine: money(dto.fine_amount, c),
    status: dto.status,
    daysLate: dto.days_late,
    paidAt: dto.paid_at,
    method: dto.method,
    paymentSource: dto.payment_source,
    receivedOn: dto.received_on,
    paymentReference: dto.payment_reference,
    receiptNo: dto.receipt_no,
    allowedActions: dto.allowed_actions,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

export function filtersToApi(f) {
  return {
    q: f.search || undefined,
    status: f.status || undefined,
    booking_id: f.bookingId || undefined,
    customer_id: f.customerId || undefined,
    project_id: f.projectId || undefined,
    unit_kind: f.unitKind || undefined,
    due_from: f.dueFrom || undefined,
    due_to: f.dueTo || undefined,
    sort: f.sort ? `${SORT_TO_WIRE[f.sort.field]}:${f.sort.dir}` : undefined,
  };
}

/**
 * @param {{ method: string, amountMinor?: number|null, reference?: string, receivedOn?: string,
 *   note?: string, adjustedAmountMinor?: number|null, adjustmentReason?: string }} payment
 */
export function paymentToApi(payment) {
  return {
    method: payment.method,
    amount: payment.amountMinor ?? undefined,
    reference: payment.reference || undefined,
    received_on: payment.receivedOn || undefined,
    note: payment.note || undefined,
    ...adjustmentToApi(payment),
  };
}

function adjustmentToApi(payment) {
  if (payment.adjustedAmountMinor == null) return {};
  return {
    adjusted_amount: payment.adjustedAmountMinor,
    adjustment_reason: payment.adjustmentReason || undefined,
  };
}

/** Start a card payment: part amount and/or an adjusted invoice amount. */
export const paymentIntentToApi = (payment) => ({
  amount: payment.amountMinor ?? undefined,
  ...adjustmentToApi(payment),
});

/** @returns {{ paymentIntentId: string, clientSecret: string, amount: import('../../lib/money.js').Money }} */
export const intentFromApi = (dto) => ({
  paymentIntentId: dto.payment_intent_id,
  clientSecret: dto.client_secret,
  amount: money(dto.amount, dto.currency),
});

export const cardPaymentToApi = (paymentIntentId) => ({ payment_intent_id: paymentIntentId });

export function fieldErrorsFromApi(fieldErrors) {
  return Object.fromEntries(
    Object.entries(fieldErrors ?? {}).map(([wire, message]) => [
      WIRE_TO_FIELD[wire] ?? wire,
      message,
    ]),
  );
}
