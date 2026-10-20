import { appendAudit } from './audit.js';
import { nowIso } from './clock.js';
import { daysBetween, today } from './dates.js';
import { MockApiError } from './errors.js';
import { compareValues, paginate, parseSort } from './pagination.js';
import { balanceOf, isActive } from './register.js';
import { allowedActions, transition } from './stateMachines.js';
import { lookups } from './bookings.js';

const SORTABLE = ['due_date', 'amount', 'balance', 'status', 'invoice_no', 'seq'];
const METHODS = ['cash', 'bank_transfer', 'online', 'cheque'];

export function toInstallmentDto(db, row, lk, ctx) {
  const booking = lk.bookingsById.get(row.booking_id);
  const unit = lk.units.get(booking.unit_id);
  const customer = lk.customers.get(booking.customer_id);
  const late = daysBetween(row.due_date, today(db));
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    booking_id: row.booking_id,
    invoice_no: row.invoice_no,
    seq: row.seq,
    kind: row.kind,
    unit_no: unit.unit_no,
    unit_kind: unit.kind,
    project_name: lk.projects.get(unit.project_id)?.name ?? '',
    buyer_name: customer.full_name,
    issued_on: row.issued_on,
    due_date: row.due_date,
    amount: row.amount,
    paid_amount: row.paid_amount,
    balance: isActive(row) ? balanceOf(row) : 0,
    fine_amount: row.fine_amount,
    currency: booking.currency,
    status: row.status,
    days_late: row.status === 'overdue' || row.status === 'due' ? Math.max(0, late) : 0,
    paid_at: row.paid_at,
    method: row.method,
    payment_reference: row.payment_reference,
    receipt_no: row.receipt_no,
    allowed_actions: allowedActions('installment', row, ctx.user),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function installmentLookups(db, ctx) {
  const lk = lookups(db, ctx);
  lk.bookingsById = new Map(
    db.bookings.filter((b) => b.tenant_id === ctx.tenant.id).map((b) => [b.id, b]),
  );
  return lk;
}

export function listInstallments(db, ctx, params) {
  const { q, status, booking_id: bookingId, project_id: projectId, unit_kind: unitKind } = params;
  const customerId = params.customer_id;
  const { due_from: dueFrom, due_to: dueTo, cursor, limit } = params;
  const sort = parseSort(params.sort, SORTABLE, { field: 'due_date', dir: 'asc' });
  const lk = installmentLookups(db, ctx);
  const needle = q?.trim().toLowerCase();

  let dtos = [];
  for (const row of db.installments) {
    if (row.tenant_id !== ctx.tenant.id) continue;
    if (status && row.status !== status) continue;
    if (bookingId && row.booking_id !== bookingId) continue;
    if (customerId && lk.bookingsById.get(row.booking_id).customer_id !== customerId) continue;
    if (dueFrom && row.due_date < dueFrom) continue;
    if (dueTo && row.due_date > dueTo) continue;
    const dto = toInstallmentDto(db, row, lk, ctx);
    if (
      projectId &&
      lk.units.get(lk.bookingsById.get(row.booking_id).unit_id).project_id !== projectId
    ) {
      continue;
    }
    if (unitKind && dto.unit_kind !== unitKind) continue;
    if (
      needle &&
      !`${dto.invoice_no} ${dto.unit_no} ${dto.buyer_name} ${dto.payment_reference ?? ''}`
        .toLowerCase()
        .includes(needle)
    ) {
      continue;
    }
    dtos.push(dto);
  }
  dtos = dtos.sort(
    (a, b) =>
      compareValues(a[sort.field], b[sort.field]) * (sort.dir === 'desc' ? -1 : 1) ||
      compareValues(a.booking_id, b.booking_id) ||
      a.seq - b.seq,
  );
  const page = paginate(dtos, { cursor, limit });
  return { items: page.items, cursors: page.cursors, nextCursor: page.nextCursor };
}

function validatePayment(db, ctx, row, body) {
  const errors = [];
  const balance = balanceOf(row);
  if (!METHODS.includes(body.method))
    errors.push({ field: 'method', message: 'Choose a payment method' });
  if (body.amount !== undefined && body.amount !== null) {
    if (!Number.isInteger(body.amount) || body.amount <= 0) {
      errors.push({
        field: 'amount',
        message: 'Amount must be a positive whole number of minor units',
      });
    } else if (body.amount > balance) {
      errors.push({ field: 'amount', message: 'Amount cannot exceed the balance of this invoice' });
    }
  }
  const reference = body.reference?.trim();
  if (
    reference &&
    db.installments.some(
      (i) => i.tenant_id === ctx.tenant.id && i.payment_reference === reference && i.id !== row.id,
    )
  ) {
    errors.push({ field: 'reference', message: 'Payment reference is already used' });
  }
  if (errors.length) {
    throw new MockApiError(422, 'VALIDATION_ERROR', 'The payment could not be recorded', errors);
  }
  return { amount: body.amount ?? balance, reference };
}

function nextReference(db, ctx) {
  const slug = ctx.tenant.slug.toUpperCase();
  let n = db.installments.filter(
    (i) => i.tenant_id === ctx.tenant.id && i.payment_reference,
  ).length;
  let ref;
  do {
    n += 1;
    ref = `PAY-${slug}-${String(n).padStart(6, '0')}`;
  } while (db.installments.some((i) => i.payment_reference === ref));
  return { ref, receipt: `RCT-${slug}-${String(n).padStart(6, '0')}` };
}

/** Staff-recorded payment (full or part). Completes the booking and sells the unit when settled. */
export function payInstallment(db, ctx, id, body) {
  const row = db.installments.find((i) => i.id === id && i.tenant_id === ctx.tenant.id);
  if (!row) throw new MockApiError(404, 'NOT_FOUND', 'Invoice not found');
  if (!allowedActions('installment', row, ctx.user).includes('record_payment')) {
    throw new MockApiError(
      409,
      'INVALID_TRANSITION',
      `Cannot record a payment on a ${row.status} invoice`,
    );
  }
  const { amount, reference } = validatePayment(db, ctx, row, body);
  const before = { status: row.status, paid_amount: row.paid_amount };
  const at = nowIso(db.clock);
  const generated = nextReference(db, ctx);

  row.paid_amount += amount;
  row.method = body.method;
  row.payment_reference = reference || generated.ref;
  row.updated_at = at;
  if (row.paid_amount >= row.amount) {
    row.status = transition('installment', row.status, 'record_payment');
    row.paid_at = at;
    row.receipt_no = generated.receipt;
  }
  appendAudit(db, {
    actor: ctx.user,
    action: 'installment.record_payment',
    subjectType: 'installment',
    subjectId: row.id,
    before,
    after: { status: row.status, paid_amount: row.paid_amount },
  });
  settleBookingIfComplete(db, ctx, row.booking_id, at);

  const lk = installmentLookups(db, ctx);
  return toInstallmentDto(db, row, lk, ctx);
}

function settleBookingIfComplete(db, ctx, bookingId, at) {
  const rows = db.installments.filter((i) => i.booking_id === bookingId && isActive(i));
  if (rows.length === 0 || rows.some((i) => i.status !== 'paid')) return;
  const booking = db.bookings.find((b) => b.id === bookingId);
  const unit = db.units.find((u) => u.id === booking.unit_id);
  if (booking.status === 'completed') return;
  booking.status = 'completed';
  booking.updated_at = at;
  const before = { status: unit.status };
  unit.status = transition('unit', unit.status, 'sell');
  unit.updated_at = at;
  unit.status_history.push({
    status: unit.status,
    changed_by: null,
    changed_by_name: null,
    changed_at: at,
  });
  appendAudit(db, {
    actor: ctx.user,
    action: 'unit.sell',
    subjectType: 'unit',
    subjectId: unit.id,
    before,
    after: { status: unit.status },
  });
}
