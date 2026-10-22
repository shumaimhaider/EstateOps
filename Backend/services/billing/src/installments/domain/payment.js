import { ForbiddenError, isIsoDate, newId, validator } from '@estateops/kernel';
import { balanceOf, invoiceMachine } from './invoice.js';

/** Methods staff can record by hand ("mark as received"). Card payments go through the card provider. */
export const MANUAL_METHODS = Object.freeze(['cash', 'bank_transfer', 'online', 'cheque']);
const MIN_REASON = 3;
const MAX_NOTE = 200;

/**
 * Validates a payment request against an invoice and returns what to apply. Nothing is changed here.
 * `input`: { method, amount?, reference?, receivedOn?, note?, adjustedAmount?, adjustmentReason? }.
 * `methods` is the list of allowed methods (null for card payments, which have none to choose).
 * `ctx`: { today, canAdjust, referenceTaken }.
 */
export function planPayment(
  invoice,
  input,
  { today, canAdjust, referenceTaken },
  { methods = null } = {},
) {
  const v = validator('The payment could not be recorded');

  let adjustment = null;
  if (input.adjustedAmount !== undefined && input.adjustedAmount !== null) {
    if (!canAdjust) throw new ForbiddenError('Your role cannot adjust invoice amounts');
    const next = input.adjustedAmount;
    if (!Number.isSafeInteger(next) || next <= invoice.paidAmount) {
      v.add('adjusted_amount', 'The new invoice amount must be a whole number above what is paid');
    } else if (next !== invoice.amount) {
      const reason = input.adjustmentReason?.trim();
      if (!reason || reason.length < MIN_REASON)
        v.add('adjustment_reason', 'Give a reason for changing the invoice amount');
      else adjustment = { amount: next, reason };
    }
  }
  const balance = Math.max(0, (adjustment?.amount ?? invoice.amount) - invoice.paidAmount);

  if (methods && !methods.includes(input.method)) v.add('method', 'Choose a payment method');
  if (input.amount !== undefined && input.amount !== null) {
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0)
      v.add('amount', 'Amount must be a positive whole number of minor units');
    else if (input.amount > balance)
      v.add('amount', 'Amount cannot exceed the balance of this invoice');
  } else if (balance === 0) {
    v.add('amount', 'There is nothing left to pay on this invoice');
  }
  if (input.receivedOn !== undefined && input.receivedOn !== null) {
    if (!isIsoDate(input.receivedOn)) v.add('received_on', 'Enter the date the money was received');
    else if (input.receivedOn > today)
      v.add('received_on', 'The received date cannot be in the future');
  }
  const reference = input.reference?.trim();
  if (reference && referenceTaken) v.add('reference', 'Payment reference is already used');
  if ((input.note ?? '').length > MAX_NOTE) v.add('note', 'Note is too long');
  v.done();

  return {
    amount: input.amount ?? balance,
    reference: reference || null,
    receivedOn: input.receivedOn ?? today,
    note: input.note?.trim() || null,
    adjustment,
  };
}

/**
 * Applies a planned payment to an invoice: changes the amount first if asked (keeping the original
 * and the reason), books the money, and marks the invoice paid with a receipt when it is settled.
 * `numbers`: { reference, receipt } generated for this payment.
 * @returns {{ invoice, payment }}
 */
export function applyPayment(
  invoice,
  plan,
  { method, source, now, numbers, stripeIntentId = null, actor },
) {
  const next = { ...invoice };
  if (plan.adjustment) {
    next.amount = plan.adjustment.amount;
    next.adjustmentReason = plan.adjustment.reason;
  }
  next.paidAmount += plan.amount;
  next.method = method;
  next.paymentSource = source;
  next.receivedOn = plan.receivedOn;
  next.paymentReference = plan.reference ?? numbers.reference;
  if (next.paidAmount >= next.amount) {
    next.status = invoiceMachine.transition(next.status, 'record_payment');
    next.paidAt = now;
    next.receiptNo = numbers.receipt;
  }
  const payment = {
    id: newId(),
    tenantId: invoice.tenantId,
    installmentId: invoice.id,
    bookingId: invoice.bookingId,
    amount: plan.amount,
    method,
    source,
    reference: next.paymentReference,
    receivedOn: plan.receivedOn,
    note: plan.note,
    stripeIntentId,
    recordedBy: actor?.userId ?? null,
    recordedByName: actor?.name ?? null,
  };
  return { invoice: next, payment };
}

export { balanceOf };
