import { addDays } from '@estateops/kernel';

const AGEING = [
  { bucket: '1-30', min: 1, max: 30 },
  { bucket: '31-60', min: 31, max: 60 },
  { bucket: '61-90', min: 61, max: 90 },
  { bucket: '90+', min: 91, max: Infinity },
];
const KINDS = ['plot', 'flat', 'villa', 'shop'];
const ACTIVE = "status NOT IN ('waived', 'cancelled', 'rescheduled')";

/** The twelve months around `asOf`: six before, the current one, five after. */
export function monthWindow(asOf, before = 6, after = 5) {
  const [y, m] = asOf.split('-').map(Number);
  return Array.from({ length: before + after + 1 }, (_, i) => {
    const total = y * 12 + (m - 1) + (i - before);
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  });
}

/**
 * Collection figures in SQL aggregates over the invoices (one pass each), so the dashboard always
 * equals the register. `projectId` narrows everything to one project.
 */
export class StatsRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  async collect(tenantId, { projectId, asOf, escalationMissed }) {
    const q = (sql, extra = []) => this.manager.query(sql, extra);
    const proj = projectId ? ' AND project_id = $2' : '';
    const args = projectId ? [tenantId, projectId] : [tenantId];
    const months = monthWindow(asOf);
    const windowStart = `${months[0]}-01`;
    const windowEnd = addDays(`${months.at(-1)}-28`, 5).slice(0, 7) + '-01';

    const [inv] = await q(
      `SELECT
         count(*) FILTER (WHERE ${ACTIVE})::int AS total,
         count(*) FILTER (WHERE status = 'paid')::int AS paid,
         count(*) FILTER (WHERE status = 'due')::int AS due,
         count(*) FILTER (WHERE status = 'overdue')::int AS overdue,
         count(*) FILTER (WHERE status = 'scheduled')::int AS upcoming,
         coalesce(sum(paid_amount), 0)::bigint AS received,
         coalesce(sum(fine_amount), 0)::bigint AS fine,
         coalesce(sum(GREATEST(amount - paid_amount, 0)) FILTER (WHERE ${ACTIVE}), 0)::bigint AS pending,
         coalesce(sum(GREATEST(amount - paid_amount, 0)) FILTER (WHERE status = 'overdue'), 0)::bigint AS overdue_amount,
         coalesce(sum(GREATEST(amount - paid_amount, 0)) FILTER (WHERE ${ACTIVE} AND status <> 'paid'
           AND date_trunc('month', due_date) = date_trunc('month', ${projectId ? '$3' : '$2'}::date)), 0)::bigint AS due_this_month
       FROM billing.installment WHERE tenant_id = $1${proj}`,
      projectId ? [tenantId, projectId, asOf] : [tenantId, asOf],
    );
    const [bk] = await q(
      `SELECT count(*)::int AS n, coalesce(sum(total_price), 0)::bigint AS value FROM billing.booking_ref WHERE tenant_id = $1 AND status <> 'cancelled'${proj}`,
      args,
    );
    const [esc] = await q(
      `SELECT count(*)::int AS n FROM (SELECT booking_id FROM billing.installment WHERE tenant_id = $1 AND status = 'overdue'${proj}
         GROUP BY booking_id HAVING count(*) >= ${Number(escalationMissed)}) x`,
      args,
    );

    const unitRows = await q(
      `SELECT kind, status, count(*)::int AS n FROM billing.unit_ref WHERE tenant_id = $1${proj} GROUP BY kind, status`,
      args,
    );
    const unitCount = (status) =>
      unitRows.filter((r) => !status || r.status === status).reduce((a, r) => a + r.n, 0);
    const unitsByKind = KINDS.map((kind) => {
      const of = (status) =>
        unitRows
          .filter((r) => r.kind === kind && (!status || r.status === status))
          .reduce((a, r) => a + r.n, 0);
      return {
        kind,
        total: of(),
        available: of('available'),
        held: of('held'),
        booked: of('booked'),
        sold: of('sold'),
        blocked: of('blocked'),
      };
    }).filter((row) => row.total > 0);

    const monthRows = await q(
      `SELECT to_char(due_date, 'YYYY-MM') AS month, sum(amount)::bigint AS due, sum(paid_amount)::bigint AS collected
         FROM billing.installment WHERE tenant_id = $1${proj} AND ${ACTIVE}
          AND due_date >= $${args.length + 1}::date AND due_date < $${args.length + 2}::date GROUP BY 1`,
      [...args, windowStart, windowEnd],
    );
    const byMonthKey = new Map(monthRows.map((r) => [r.month, r]));

    const ageRows = await q(
      `SELECT ($${args.length + 1}::date - due_date) AS late, GREATEST(amount - paid_amount, 0)::bigint AS balance
         FROM billing.installment WHERE tenant_id = $1${proj} AND status = 'overdue'`,
      [...args, asOf],
    );
    const ageing = AGEING.map((b) => {
      const inBucket = ageRows.filter((r) => r.late >= b.min && r.late <= b.max);
      return {
        bucket: b.bucket,
        count: inBucket.length,
        amount: inBucket.reduce((a, r) => a + r.balance, 0),
      };
    });

    const projects = await q(
      `SELECT project_id, name FROM billing.project_ref WHERE tenant_id = $1${projectId ? ' AND project_id = $2' : ''} ORDER BY name`,
      args,
    );
    const perUnits = await q(
      `SELECT project_id, count(*)::int AS n FROM billing.unit_ref WHERE tenant_id = $1${proj} GROUP BY project_id`,
      args,
    );
    const perBookings = await q(
      `SELECT project_id, count(*)::int AS n, coalesce(sum(total_price), 0)::bigint AS value FROM billing.booking_ref WHERE tenant_id = $1 AND status <> 'cancelled'${proj} GROUP BY project_id`,
      args,
    );
    const perMoney = await q(
      `SELECT project_id, coalesce(sum(paid_amount), 0)::bigint AS received,
              coalesce(sum(GREATEST(amount - paid_amount, 0)) FILTER (WHERE ${ACTIVE}), 0)::bigint AS pending,
              coalesce(sum(GREATEST(amount - paid_amount, 0)) FILTER (WHERE status = 'overdue'), 0)::bigint AS overdue
         FROM billing.installment WHERE tenant_id = $1${proj} GROUP BY project_id`,
      args,
    );
    const by = (rows) => new Map(rows.map((r) => [r.project_id, r]));
    const units = by(perUnits);
    const bookings = by(perBookings);
    const money = by(perMoney);

    return {
      summary: {
        totalSaleValue: bk.value,
        receivedAmount: inv.received,
        pendingAmount: inv.pending,
        overdueAmount: inv.overdue_amount,
        dueThisMonthAmount: inv.due_this_month,
        fineAmount: inv.fine,
        installmentsTotal: inv.total,
        installmentsPaid: inv.paid,
        installmentsDue: inv.due,
        installmentsOverdue: inv.overdue,
        installmentsUpcoming: inv.upcoming,
        bookingsCount: bk.n,
        escalatedCount: esc.n,
        unitsTotal: unitCount(),
        unitsAvailable: unitCount('available'),
        unitsBooked: unitCount('booked'),
        unitsSold: unitCount('sold'),
      },
      byMonth: months.map((month) => ({
        month,
        dueAmount: byMonthKey.get(month)?.due ?? 0,
        collectedAmount: byMonthKey.get(month)?.collected ?? 0,
      })),
      ageing,
      unitsByKind,
      byProject: projects.map((p) => ({
        projectId: p.project_id,
        projectName: p.name,
        unitsTotal: units.get(p.project_id)?.n ?? 0,
        unitsSold: bookings.get(p.project_id)?.n ?? 0,
        saleValue: bookings.get(p.project_id)?.value ?? 0,
        receivedAmount: money.get(p.project_id)?.received ?? 0,
        pendingAmount: money.get(p.project_id)?.pending ?? 0,
        overdueAmount: money.get(p.project_id)?.overdue ?? 0,
      })),
    };
  }
}
