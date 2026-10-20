import { money } from '../../lib/money.js';

const SORT_TO_WIRE = {
  dueDate: 'due_date',
  amount: 'amount',
  balance: 'balance',
  status: 'status',
  invoiceNo: 'invoice_no',
  sequence: 'seq',
};
const FIELD_TO_WIRE = { amount: 'amount', method: 'method', reference: 'reference' };
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
    paid: money(dto.paid_amount, c),
    balance: money(dto.balance, c),
    fine: money(dto.fine_amount, c),
    status: dto.status,
    daysLate: dto.days_late,
    paidAt: dto.paid_at,
    method: dto.method,
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

/** @param {{ method: string, amountMinor?: number|null, reference?: string }} payment */
export function paymentToApi(payment) {
  return {
    method: payment.method,
    amount: payment.amountMinor ?? undefined,
    reference: payment.reference || undefined,
  };
}

export function fieldErrorsFromApi(fieldErrors) {
  return Object.fromEntries(
    Object.entries(fieldErrors ?? {}).map(([wire, message]) => [
      WIRE_TO_FIELD[wire] ?? wire,
      message,
    ]),
  );
}
