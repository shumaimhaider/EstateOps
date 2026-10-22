import { isActive, outstanding } from './invoice.js';

/**
 * A booking's money position, summed from its invoices. Every figure in the portal comes from the
 * same rows, so registers, bookings, customers and stats always agree. The SQL aggregate in the
 * repository must give the same numbers: the infrastructure tests check the two against each other.
 */
export function summarizeInvoices(invoices, escalationMissed) {
  const out = {
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
  };
  for (const inv of invoices) {
    out.receivedAmount += inv.paidAmount;
    out.fineAmount += inv.fineAmount;
    if (!isActive(inv)) continue;
    out.installmentsTotal += 1;
    out.pendingAmount += outstanding(inv);
    if (inv.status === 'paid') out.installmentsPaid += 1;
    else if (inv.status === 'due') out.installmentsDue += 1;
    else if (inv.status === 'overdue') {
      out.installmentsOverdue += 1;
      out.overdueAmount += outstanding(inv);
    } else out.installmentsUpcoming += 1;
    if (inv.status !== 'paid' && (!out.nextDueDate || inv.dueDate < out.nextDueDate))
      out.nextDueDate = inv.dueDate;
  }
  out.escalated = out.installmentsOverdue >= escalationMissed;
  return out;
}

/** True when every active invoice is paid and there is at least one: the sale is settled. */
export const isSettled = (invoices) => {
  const active = invoices.filter(isActive);
  return active.length > 0 && active.every((i) => i.status === 'paid');
};
