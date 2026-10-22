import { daysBetween, defineMachine, to } from '@estateops/kernel';

export const INVOICE_STATUSES = Object.freeze([
  'scheduled',
  'due',
  'paid',
  'overdue',
  'waived',
  'rescheduled',
  'cancelled',
]);
/** Waived, rescheduled and cancelled invoices are inactive: they leave pending and overdue totals. */
export const INACTIVE_STATUSES = Object.freeze(['waived', 'rescheduled', 'cancelled']);
export const UNPAID_OPEN = Object.freeze(['scheduled', 'due', 'overdue']);

/**
 * scheduled -> due -> overdue are moved by the daily sweep. Staff pay, waive or cancel. A paid,
 * waived or cancelled invoice is final.
 */
export const invoiceMachine = defineMachine('invoice', {
  scheduled: {
    activate: to('due', true),
    mark_overdue: to('overdue', true),
    record_payment: to('paid'),
    waive: to('waived'),
    cancel: to('cancelled'),
  },
  due: {
    mark_overdue: to('overdue', true),
    record_payment: to('paid'),
    waive: to('waived'),
    cancel: to('cancelled'),
  },
  overdue: { record_payment: to('paid'), waive: to('waived'), cancel: to('cancelled') },
  paid: {},
  waived: {},
  rescheduled: {},
  cancelled: {},
});

export const isActive = (invoice) => !INACTIVE_STATUSES.includes(invoice.status);
export const balanceOf = (invoice) => Math.max(0, invoice.amount - invoice.paidAmount);
/** What the customer still owes on an invoice: nothing once it is inactive. */
export const outstanding = (invoice) => (isActive(invoice) ? balanceOf(invoice) : 0);

/** The state a still-unpaid invoice should be in on `today`: due after its date, overdue after the grace. */
export function statusForDate(dueDate, today, graceDays) {
  const late = daysBetween(dueDate, today);
  if (late <= 0) return 'scheduled';
  return late <= graceDays ? 'due' : 'overdue';
}

export function daysLate(invoice, today) {
  return invoice.status === 'overdue' || invoice.status === 'due'
    ? Math.max(0, daysBetween(invoice.dueDate, today))
    : 0;
}

export const isPartPaid = (invoice) => invoice.paidAmount > 0 && invoice.status !== 'paid';
