import { daysBetween, today } from './dates.js';
import { MockApiError } from './errors.js';
import { compareValues, paginate, parseSort } from './pagination.js';
import { balanceOf, isActive } from './register.js';
import { lookups } from './bookings.js';
import { applyPayment, invoiceActions, MANUAL_METHODS, planPayment } from './payments.js';

const SORTABLE = ['due_date', 'amount', 'balance', 'status', 'invoice_no', 'seq'];

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
    original_amount: row.original_amount ?? row.amount,
    adjustment_reason: row.adjustment_reason ?? null,
    paid_amount: row.paid_amount,
    balance: isActive(row) ? balanceOf(row) : 0,
    fine_amount: row.fine_amount,
    currency: booking.currency,
    status: row.status,
    days_late: row.status === 'overdue' || row.status === 'due' ? Math.max(0, late) : 0,
    paid_at: row.paid_at,
    method: row.method,
    payment_source: row.payment_source ?? null,
    received_on: row.received_on ?? null,
    payment_reference: row.payment_reference,
    receipt_no: row.receipt_no,
    allowed_actions: invoiceActions(row, ctx.user),
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

export function findInstallment(db, ctx, id) {
  const row = db.installments.find((i) => i.id === id && i.tenant_id === ctx.tenant.id);
  if (!row) throw new MockApiError(404, 'NOT_FOUND', 'Invoice not found');
  return row;
}

export const getInstallmentDto = (db, ctx, row) =>
  toInstallmentDto(db, row, installmentLookups(db, ctx), ctx);

/**
 * Staff mark a payment received by hand (full or part, any past date), optionally adjusting the
 * invoice amount first. Completes the booking and sells the unit when everything is settled.
 */
export function payInstallment(db, ctx, id, body) {
  const row = findInstallment(db, ctx, id);
  if (!invoiceActions(row, ctx.user).includes('record_payment')) {
    throw new MockApiError(
      409,
      'INVALID_TRANSITION',
      `Cannot record a payment on a ${row.status} invoice`,
    );
  }
  const plan = planPayment(db, ctx, row, body, { methods: MANUAL_METHODS });
  applyPayment(db, ctx, row, plan, { method: body.method, source: 'manual' });
  return getInstallmentDto(db, ctx, row);
}
