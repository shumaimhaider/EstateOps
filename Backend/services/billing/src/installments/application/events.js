import { EVENT, buildEvent } from '@estateops/contracts';

const make = (tenantId, type, data, now) =>
  buildEvent({ type, tenantId, producer: 'billing', data, now });

export const scheduleCreated = (ref, count, now) =>
  make(ref.tenantId, EVENT.SCHEDULE_CREATED, { booking_id: ref.bookingId, invoices: count }, now);

export const scheduleFailed = (tenantId, bookingId, reason, now) =>
  make(
    tenantId,
    EVENT.SCHEDULE_FAILED,
    { booking_id: bookingId, reason: String(reason).slice(0, 200) },
    now,
  );

export const bookingFullyPaid = (ref, now) =>
  make(ref.tenantId, EVENT.BOOKING_FULLY_PAID, { booking_id: ref.bookingId }, now);

export const paymentRecorded = (payment, now) =>
  make(
    payment.tenantId,
    EVENT.PAYMENT_RECORDED,
    {
      payment_id: payment.id,
      installment_id: payment.installmentId,
      booking_id: payment.bookingId,
      amount: payment.amount,
      source: payment.source,
    },
    now,
  );

export const bookingSummaryChanged = (ref, summary, seq, now) =>
  make(
    ref.tenantId,
    EVENT.BOOKING_SUMMARY_CHANGED,
    {
      booking_id: ref.bookingId,
      customer_id: ref.customerId,
      seq,
      unit_no: ref.unitNo,
      total_price: ref.totalPrice,
      currency: ref.currency,
      installments_total: summary.installmentsTotal,
      installments_paid: summary.installmentsPaid,
      installments_due: summary.installmentsDue,
      installments_overdue: summary.installmentsOverdue,
      installments_upcoming: summary.installmentsUpcoming,
      received_amount: summary.receivedAmount,
      pending_amount: summary.pendingAmount,
      overdue_amount: summary.overdueAmount,
      fine_amount: summary.fineAmount,
      next_due_date: summary.nextDueDate,
      escalated: summary.escalated,
    },
    now,
  );

export const fineRateChanged = (tenantId, { scope, scopeId, unitKind }, now) =>
  make(tenantId, EVENT.FINE_RATE_CHANGED, { scope, scope_id: scopeId, unit_kind: unitKind }, now);
