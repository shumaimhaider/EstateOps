/** The server lists the valid actions; the UI only presents the ones it knows how to run. */
export const canRecordPayment = (invoice) => invoice.allowedActions.includes('record_payment');

/** Invoices a payment can still be taken against, oldest due date first. */
export function payableInvoices(invoices) {
  return invoices
    .filter((i) => canRecordPayment(i) && i.balance.minor > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.sequence - b.sequence);
}

export const isPartPaid = (invoice) => invoice.paid.minor > 0 && invoice.status !== 'paid';
