/**
 * Installment-register arithmetic. Every dashboard number comes from these functions over the
 * same installment rows the register lists, so totals always equal the register (RPT-8).
 */
const INACTIVE = new Set(['waived', 'cancelled', 'rescheduled']);

export const isActive = (row) => !INACTIVE.has(row.status);
export const balanceOf = (row) => Math.max(0, row.amount - row.paid_amount);

export function summarize(rows) {
  const out = {
    installments_total: 0,
    installments_paid: 0,
    installments_due: 0,
    installments_overdue: 0,
    installments_upcoming: 0,
    received_amount: 0,
    pending_amount: 0,
    overdue_amount: 0,
    fine_amount: 0,
    next_due_date: null,
  };
  for (const row of rows) {
    out.received_amount += row.paid_amount;
    out.fine_amount += row.fine_amount;
    if (!isActive(row)) continue;
    out.installments_total += 1;
    out.pending_amount += balanceOf(row);
    if (row.status === 'paid') out.installments_paid += 1;
    else if (row.status === 'due') out.installments_due += 1;
    else if (row.status === 'overdue') {
      out.installments_overdue += 1;
      out.overdue_amount += balanceOf(row);
    } else out.installments_upcoming += 1;
    if (row.status !== 'paid' && (!out.next_due_date || row.due_date < out.next_due_date)) {
      out.next_due_date = row.due_date;
    }
  }
  return out;
}

export function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const k = row[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
}
