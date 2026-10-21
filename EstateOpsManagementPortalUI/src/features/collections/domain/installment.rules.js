/** The server lists the valid actions; the UI only presents the ones it knows how to run. */
export const canMarkReceived = (invoice) => invoice.allowedActions.includes('record_payment');
export const canPayByCard = (invoice) => invoice.allowedActions.includes('pay_by_card');
export const canAdjustAmount = (invoice) => invoice.allowedActions.includes('adjust_amount');

/** A payment can be taken on this invoice, by hand or by card. */
export const canRecordPayment = (invoice) => canMarkReceived(invoice) || canPayByCard(invoice);

/** Invoices a payment can still be taken against, oldest due date first. */
export function payableInvoices(invoices) {
  return invoices
    .filter((i) => canRecordPayment(i) && i.balance.minor > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.sequence - b.sequence);
}

export const isPartPaid = (invoice) => invoice.paid.minor > 0 && invoice.status !== 'paid';

export const isAdjusted = (invoice) => invoice.originalAmount.minor !== invoice.amount.minor;
