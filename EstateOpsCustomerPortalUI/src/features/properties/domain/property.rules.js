/** Share of the price already paid, 0 to 100. Integer arithmetic on minor units. */
export const paidPercent = (property) =>
  property.total.minor === 0
    ? 0
    : Math.min(100, Math.floor((property.received.minor * 100) / property.total.minor));

/** What needs the customer's attention first: overdue, then due, then nothing. */
export function attention(property) {
  if (property.installments.overdue > 0) return 'overdue';
  if (property.installments.due > 0) return 'due';
  return property.installments.paid === property.installments.total &&
    property.installments.total > 0
    ? 'complete'
    : 'ontrack';
}

/** Sums money over properties (they all share the developer's currency). */
export function portfolio(properties) {
  const sum = (pick) => properties.reduce((s, p) => s + pick(p), 0);
  return {
    count: properties.length,
    currency: properties[0]?.currency ?? null,
    total: sum((p) => p.total.minor),
    received: sum((p) => p.received.minor),
    pending: sum((p) => p.pending.minor),
    overdue: sum((p) => p.overdue.minor),
    nextDue:
      properties
        .map((p) => p.nextDueDate)
        .filter(Boolean)
        .sort()[0] ?? null,
  };
}

/** An invoice the customer can pay now. */
export const isPayable = (invoice) => invoice.payable && invoice.balance.minor > 0;

/** The invoice a "Pay next installment" button should open: overdue first, then the earliest due. */
export function nextToPay(invoices) {
  return (
    invoices
      .filter(isPayable)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.sequence - b.sequence)[0] ?? null
  );
}
