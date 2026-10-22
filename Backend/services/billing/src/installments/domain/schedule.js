import { addDays, addMonths, newId, percentOfBps, splitEvenly } from '@estateops/kernel';
import { statusForDate } from './invoice.js';

/**
 * The payment schedule of a sale: a down payment due on the booking date, then equal monthly
 * installments (the last one absorbs the rounding). A 0% plan has no down payment row, a 100%
 * plan has no installments, and no installment is ever below one minor unit.
 * @returns {Array<{ seq, kind, amount, dueDate, issuedOn, status }>}
 */
export function buildSchedule({
  totalPrice,
  downPct,
  installmentCount,
  bookedAt,
  today,
  graceDays,
}) {
  const down = percentOfBps(totalPrice, downPct * 100);
  const rest = totalPrice - down;
  const rows = [];
  if (down > 0) rows.push({ seq: 0, kind: 'down_payment', amount: down, dueDate: bookedAt });
  if (rest > 0) {
    const count = Math.min(installmentCount, rest);
    splitEvenly(rest, count).forEach((amount, i) =>
      rows.push({ seq: i + 1, kind: 'emi', amount, dueDate: addMonths(bookedAt, i + 1) }),
    );
  }
  return rows.map((row) => {
    const week = addDays(row.dueDate, -7);
    return {
      ...row,
      issuedOn: week < bookedAt ? bookedAt : week,
      status: statusForDate(row.dueDate, today, graceDays),
    };
  });
}

/** Turns schedule rows into invoices of a booking, numbered consecutively from `firstNumber`. */
export function toInvoices({ booking, rows, firstNumber, slug }) {
  return rows.map((row, i) => ({
    id: newId(),
    tenantId: booking.tenantId,
    bookingId: booking.bookingId,
    seq: row.seq,
    kind: row.kind,
    invoiceNo: `INV-${slug.toUpperCase()}-${String(firstNumber + i).padStart(6, '0')}`,
    issuedOn: row.issuedOn,
    dueDate: row.dueDate,
    amount: row.amount,
    originalAmount: row.amount,
    paidAmount: 0,
    fineAmount: 0,
    status: row.status,
    paidAt: null,
    method: null,
    paymentSource: null,
    receivedOn: null,
    paymentReference: null,
    receiptNo: null,
    adjustmentReason: null,
    projectId: booking.projectId,
    customerId: booking.customerId,
    unitId: booking.unitId,
    unitKind: booking.unitKind,
    version: 1,
  }));
}
