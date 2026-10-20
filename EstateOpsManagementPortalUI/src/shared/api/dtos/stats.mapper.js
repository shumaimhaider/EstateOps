import { money } from '../../lib/money.js';

/** @returns {import('../../../features/collections/domain/stats.model.js').CollectionsStats} */
export function fromApi(dto) {
  const c = dto.currency;
  const s = dto.summary;
  return {
    currency: c,
    asOf: dto.as_of,
    saleValue: money(s.total_sale_value, c),
    received: money(s.received_amount, c),
    pending: money(s.pending_amount, c),
    overdue: money(s.overdue_amount, c),
    dueThisMonth: money(s.due_this_month_amount, c),
    fines: money(s.fine_amount, c),
    installments: {
      total: s.installments_total,
      paid: s.installments_paid,
      due: s.installments_due,
      overdue: s.installments_overdue,
      upcoming: s.installments_upcoming,
    },
    bookingsCount: s.bookings_count,
    escalatedCount: s.escalated_count,
    units: {
      total: s.units_total,
      available: s.units_available,
      booked: s.units_booked,
      sold: s.units_sold,
    },
    // Chart series carry plain minor-unit numbers; the chart converts for display only.
    byMonth: dto.by_month.map((m) => ({
      month: m.month,
      dueMinor: m.due_amount,
      collectedMinor: m.collected_amount,
    })),
    ageing: dto.ageing.map((a) => ({
      bucket: a.bucket,
      count: a.count,
      amount: money(a.amount, c),
    })),
    unitsByKind: dto.units_by_kind,
    byProject: dto.by_project.map((p) => ({
      projectId: p.project_id,
      projectName: p.project_name,
      unitsTotal: p.units_total,
      unitsSold: p.units_sold,
      saleValue: money(p.sale_value, c),
      received: money(p.received_amount, c),
      pending: money(p.pending_amount, c),
      overdue: money(p.overdue_amount, c),
    })),
  };
}

export const filtersToApi = (f) => ({ project_id: f.projectId || undefined });
