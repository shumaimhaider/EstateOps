import { daysBetween, monthKey, today } from './dates.js';
import { balanceOf, isActive, summarize } from './register.js';
import { lookups } from './bookings.js';

const BUCKETS = [
  { bucket: '1-30', min: 1, max: 30 },
  { bucket: '31-60', min: 31, max: 60 },
  { bucket: '61-90', min: 61, max: 90 },
  { bucket: '90+', min: 91, max: Infinity },
];

function monthWindow(nowDate, before = 6, after = 5) {
  const [y, m] = nowDate.split('-').map(Number);
  return Array.from({ length: before + after + 1 }, (_, i) => {
    const total = y * 12 + (m - 1) + (i - before);
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  });
}

/** Collections statistics. Every figure is summed from the same installment rows the register lists. */
export function collectionsStats(db, ctx, { project_id: projectId }) {
  const lk = lookups(db, ctx);
  const now = today(db);
  const bookings = db.bookings.filter(
    (b) =>
      b.tenant_id === ctx.tenant.id &&
      (!projectId || lk.units.get(b.unit_id).project_id === projectId),
  );
  const rows = bookings.flatMap((b) => lk.installmentsByBooking.get(b.id) ?? []);
  const summary = summarize(rows);
  const thisMonth = monthKey(now);

  const dueByMonth = new Map();
  const collectedByMonth = new Map();
  let dueThisMonth = 0;
  const ageing = BUCKETS.map((b) => ({ bucket: b.bucket, count: 0, amount: 0 }));
  for (const row of rows) {
    if (!isActive(row)) continue;
    const month = monthKey(row.due_date);
    dueByMonth.set(month, (dueByMonth.get(month) ?? 0) + row.amount);
    collectedByMonth.set(month, (collectedByMonth.get(month) ?? 0) + row.paid_amount);
    if (month === thisMonth && row.status !== 'paid') dueThisMonth += balanceOf(row);
    if (row.status === 'overdue') {
      const late = daysBetween(row.due_date, now);
      const slot = BUCKETS.findIndex((b) => late >= b.min && late <= b.max);
      ageing[slot].count += 1;
      ageing[slot].amount += balanceOf(row);
    }
  }

  const units = db.units.filter(
    (u) => u.tenant_id === ctx.tenant.id && (!projectId || u.project_id === projectId),
  );
  const countUnits = (status) => units.filter((u) => u.status === status).length;
  const escalated = bookings.filter(
    (b) =>
      (lk.installmentsByBooking.get(b.id) ?? []).filter((i) => i.status === 'overdue').length >=
      db.settings.escalationMissed,
  ).length;

  const unitsByKind = ['plot', 'flat', 'villa', 'shop']
    .map((kind) => {
      const ofKind = units.filter((u) => u.kind === kind);
      return {
        kind,
        total: ofKind.length,
        available: ofKind.filter((u) => u.status === 'available').length,
        held: ofKind.filter((u) => u.status === 'held').length,
        booked: ofKind.filter((u) => u.status === 'booked').length,
        sold: ofKind.filter((u) => u.status === 'sold').length,
        blocked: ofKind.filter((u) => u.status === 'blocked').length,
      };
    })
    .filter((row) => row.total > 0);

  const byProject = db.projects
    .filter((p) => p.tenant_id === ctx.tenant.id && (!projectId || p.id === projectId))
    .map((p) => {
      const pBookings = bookings.filter((b) => lk.units.get(b.unit_id).project_id === p.id);
      const s = summarize(pBookings.flatMap((b) => lk.installmentsByBooking.get(b.id) ?? []));
      return {
        project_id: p.id,
        project_name: p.name,
        units_total: units.filter((u) => u.project_id === p.id).length,
        units_sold: pBookings.length,
        sale_value: pBookings.reduce((sum, b) => sum + b.total_price, 0),
        received_amount: s.received_amount,
        pending_amount: s.pending_amount,
        overdue_amount: s.overdue_amount,
      };
    });

  return {
    currency: ctx.tenant.currency,
    as_of: now,
    summary: {
      total_sale_value: bookings.reduce((sum, b) => sum + b.total_price, 0),
      received_amount: summary.received_amount,
      pending_amount: summary.pending_amount,
      overdue_amount: summary.overdue_amount,
      due_this_month_amount: dueThisMonth,
      fine_amount: summary.fine_amount,
      installments_total: summary.installments_total,
      installments_paid: summary.installments_paid,
      installments_due: summary.installments_due,
      installments_overdue: summary.installments_overdue,
      installments_upcoming: summary.installments_upcoming,
      bookings_count: bookings.length,
      escalated_count: escalated,
      units_total: units.length,
      units_available: countUnits('available'),
      units_booked: countUnits('booked'),
      units_sold: countUnits('sold'),
    },
    by_month: monthWindow(now).map((month) => ({
      month,
      due_amount: dueByMonth.get(month) ?? 0,
      collected_amount: collectedByMonth.get(month) ?? 0,
    })),
    ageing,
    units_by_kind: unitsByKind,
    by_project: byProject,
  };
}
