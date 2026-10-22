import {
  ConflictError,
  InvalidTransitionError,
  defineMachine,
  fieldError,
  isIsoDate,
  newId,
  to,
} from '@estateops/kernel';

export const BOOKING_STATUSES = Object.freeze([
  'requested',
  'confirmed',
  'active',
  'completed',
  'cancelled',
]);
export const LIVE_STATUSES = Object.freeze(['requested', 'confirmed', 'active', 'completed']);

/**
 * requested -> confirmed (unit reserved) -> active (schedule exists) -> completed (fully paid).
 * Staff can cancel before the sale completes; the rest is driven by events.
 */
export const bookingMachine = defineMachine('booking', {
  requested: {
    confirm: to('confirmed', true),
    reject: to('cancelled', true),
    cancel: to('cancelled'),
  },
  confirmed: { activate: to('active', true), cancel: to('cancelled') },
  active: { complete: to('completed', true), cancel: to('cancelled') },
  completed: {},
  cancelled: {},
});

const EMPTY_SUMMARY = Object.freeze({
  installmentsTotal: 0,
  installmentsPaid: 0,
  installmentsDue: 0,
  installmentsOverdue: 0,
  installmentsUpcoming: 0,
  receivedAmount: 0,
  pendingAmount: 0,
  overdueAmount: 0,
  fineAmount: 0,
  nextDueDate: null,
  escalated: false,
  summarySeq: 0,
});

/**
 * Starts a booking: the price, plan and names are snapshots, so later edits to the unit, plan or
 * customer do not change a sale already agreed. The unit must be for sale.
 */
export function createBooking(
  { tenantId, unit, customer, plan, bookedAt, today, createdBy = null },
  { id = newId() } = {},
) {
  if (unit.status !== 'available' && unit.status !== 'held') {
    throw new ConflictError('UNIT_NOT_AVAILABLE', `The unit is ${unit.status}`);
  }
  if (!isIsoDate(bookedAt)) throw fieldError('booked_at', 'Enter the booking date');
  if (bookedAt > today) throw fieldError('booked_at', 'The booking date cannot be in the future');
  if (!(unit.listPrice > 0))
    throw new ConflictError('UNIT_NOT_PRICED', 'The unit has no price yet');
  return {
    id,
    tenantId,
    unitId: unit.unitId,
    customerId: customer.customerId,
    planId: plan.id,
    planName: plan.name,
    downPct: plan.downPct,
    installmentCount: plan.installmentCount,
    status: 'requested',
    totalPrice: unit.listPrice,
    currency: unit.currency,
    bookedAt,
    cancelReason: null,
    unitNo: unit.unitNo,
    unitKind: unit.kind,
    projectId: unit.projectId,
    projectName: unit.projectName,
    buyerName: customer.fullName,
    buyerPhone: customer.phone,
    buyerEmail: customer.email,
    ...EMPTY_SUMMARY,
    createdBy,
    version: 1,
  };
}

export const transitionTo = (booking, action, extra = {}) => ({
  ...booking,
  ...extra,
  status: bookingMachine.transition(booking.status, action),
});

/** Staff may cancel until the sale completes, and only while no money has been received. */
export function canCancel(booking) {
  return bookingMachine.can(booking.status, 'cancel') && booking.receivedAmount === 0;
}

export function cancelByStaff(booking, reason = null) {
  if (!bookingMachine.can(booking.status, 'cancel')) {
    throw new InvalidTransitionError(`Cannot cancel a booking that is ${booking.status}`);
  }
  if (booking.receivedAmount > 0) {
    throw new ConflictError('BOOKING_HAS_PAYMENTS', 'A booking with payments cannot be cancelled');
  }
  return transitionTo(booking, 'cancel', { cancelReason: reason });
}

/** The money figures billing reports. A summary older than the one held is ignored. */
export function applySummary(booking, summary) {
  if (summary.seq <= booking.summarySeq) return booking;
  return {
    ...booking,
    installmentsTotal: summary.installments_total,
    installmentsPaid: summary.installments_paid,
    installmentsDue: summary.installments_due,
    installmentsOverdue: summary.installments_overdue,
    installmentsUpcoming: summary.installments_upcoming,
    receivedAmount: summary.received_amount,
    pendingAmount: summary.pending_amount,
    overdueAmount: summary.overdue_amount,
    fineAmount: summary.fine_amount,
    nextDueDate: summary.next_due_date,
    escalated: summary.escalated,
    summarySeq: summary.seq,
  };
}
