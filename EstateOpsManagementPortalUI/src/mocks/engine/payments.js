import { appendAudit } from './audit.js';
import { nowIso } from './clock.js';
import { today } from './dates.js';
import { MockApiError } from './errors.js';
import { hasPermission } from './permissions.js';
import { isActive } from './register.js';
import { allowedActions, transition } from './stateMachines.js';

/** Methods staff can record by hand ("mark as received"). Card payments go through Stripe. */
export const MANUAL_METHODS = ['cash', 'bank_transfer', 'online', 'cheque'];
const MAX_NOTE = 200;

/**
 * What staff may do to an invoice right now: the state machine says whether it can still be
 * paid, the role decides how (mark received by hand, charge a card) and whether the invoice
 * amount may be adjusted at payment time.
 */
export function invoiceActions(row, user) {
  const base = allowedActions('installment', row, user);
  if (!base.includes('record_payment')) return base;
  const can = (key) => !user?.permissions || user.permissions.includes(key);
  const actions = base.filter((a) => a !== 'record_payment');
  if (can('payments.record')) actions.push('record_payment');
  if (can('payments.card')) actions.push('pay_by_card');
  if (can('invoices.adjust')) actions.push('adjust_amount');
  return actions;
}

/**
 * Validates a payment request against the invoice (including an optional adjustment of the
 * invoice amount) and returns what to apply. Nothing is changed here.
 */
export function planPayment(db, ctx, row, body, { methods = null } = {}) {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });

  let adjustment = null;
  if (body.adjusted_amount !== undefined && body.adjusted_amount !== null) {
    if (!hasPermission(ctx, 'invoices.adjust')) {
      throw new MockApiError(403, 'FORBIDDEN', 'Your role cannot adjust invoice amounts');
    }
    const next = body.adjusted_amount;
    if (!Number.isInteger(next) || next <= row.paid_amount) {
      add('adjusted_amount', 'The new invoice amount must be a whole number above what is paid');
    } else if (next !== row.amount) {
      const reason = body.adjustment_reason?.trim();
      if (!reason || reason.length < 3) {
        add('adjustment_reason', 'Give a reason for changing the invoice amount');
      } else adjustment = { amount: next, reason };
    }
  }
  const balance = Math.max(0, (adjustment?.amount ?? row.amount) - row.paid_amount);

  if (methods && !methods.includes(body.method)) add('method', 'Choose a payment method');
  if (body.amount !== undefined && body.amount !== null) {
    if (!Number.isInteger(body.amount) || body.amount <= 0) {
      add('amount', 'Amount must be a positive whole number of minor units');
    } else if (body.amount > balance) {
      add('amount', 'Amount cannot exceed the balance of this invoice');
    }
  } else if (balance === 0) {
    add('amount', 'There is nothing left to pay on this invoice');
  }
  if (body.received_on !== undefined && body.received_on !== null) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(body.received_on) ||
      Number.isNaN(Date.parse(body.received_on))
    ) {
      add('received_on', 'Enter the date the money was received');
    } else if (body.received_on > today(db)) {
      add('received_on', 'The received date cannot be in the future');
    }
  }
  const reference = body.reference?.trim();
  if (
    reference &&
    db.installments.some(
      (i) => i.tenant_id === ctx.tenant.id && i.payment_reference === reference && i.id !== row.id,
    )
  ) {
    add('reference', 'Payment reference is already used');
  }
  if ((body.note ?? '').length > MAX_NOTE) add('note', 'Note is too long');
  if (errors.length) {
    throw new MockApiError(422, 'VALIDATION_ERROR', 'The payment could not be recorded', errors);
  }
  return {
    amount: body.amount ?? balance,
    reference,
    receivedOn: body.received_on ?? today(db),
    note: body.note?.trim() || null,
    adjustment,
  };
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

/** Applies a planned payment: adjusts the invoice if asked, books the money, settles the sale. */
export function applyPayment(db, ctx, row, plan, { method, source, stripeIntentId = null }) {
  const at = nowIso(db.clock);
  const before = { status: row.status, paid_amount: row.paid_amount, amount: row.amount };
  const generated = nextReference(db, ctx);

  if (plan.adjustment) {
    row.original_amount ??= row.amount;
    row.amount = plan.adjustment.amount;
    row.adjustment_reason = plan.adjustment.reason;
    appendAudit(db, {
      actor: ctx.user,
      action: 'installment.adjust_amount',
      subjectType: 'installment',
      subjectId: row.id,
      before: { amount: before.amount },
      after: { amount: row.amount, reason: plan.adjustment.reason },
    });
  }

  row.paid_amount += plan.amount;
  row.method = method;
  row.payment_source = source;
  row.received_on = plan.receivedOn;
  row.payment_reference = plan.reference || generated.ref;
  row.updated_at = at;
  if (row.paid_amount >= row.amount) {
    row.status = transition('installment', row.status, 'record_payment');
    row.paid_at = at;
    row.receipt_no = generated.receipt;
  }
  db.payments.push({
    id: globalThis.crypto.randomUUID(),
    tenant_id: ctx.tenant.id,
    installment_id: row.id,
    amount: plan.amount,
    method,
    source,
    reference: row.payment_reference,
    received_on: plan.receivedOn,
    note: plan.note,
    stripe_intent_id: stripeIntentId,
    recorded_by: ctx.user.id,
    created_at: at,
  });
  appendAudit(db, {
    actor: ctx.user,
    action: source === 'stripe' ? 'installment.card_payment' : 'installment.record_payment',
    subjectType: 'installment',
    subjectId: row.id,
    before: { status: before.status, paid_amount: before.paid_amount },
    after: { status: row.status, paid_amount: row.paid_amount },
  });
  settleBookingIfComplete(db, ctx, row.booking_id, at);
}

/** When every active installment is paid the booking completes and the unit is sold. */
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
