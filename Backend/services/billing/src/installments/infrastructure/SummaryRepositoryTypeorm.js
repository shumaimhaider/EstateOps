/** A booking's money position, aggregated in SQL from its invoices (must equal summarizeInvoices). */
export class SummaryRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  async compute(tenantId, bookingId, escalationMissed) {
    const [r] = await this.manager.query(
      `SELECT
         count(*) FILTER (WHERE status NOT IN ('waived', 'cancelled', 'rescheduled'))::int AS total,
         count(*) FILTER (WHERE status = 'paid')::int AS paid,
         count(*) FILTER (WHERE status = 'due')::int AS due,
         count(*) FILTER (WHERE status = 'overdue')::int AS overdue,
         count(*) FILTER (WHERE status = 'scheduled')::int AS upcoming,
         coalesce(sum(paid_amount), 0)::bigint AS received,
         coalesce(sum(fine_amount), 0)::bigint AS fine,
         coalesce(sum(GREATEST(amount - paid_amount, 0)) FILTER (WHERE status NOT IN ('waived', 'cancelled', 'rescheduled')), 0)::bigint AS pending,
         coalesce(sum(GREATEST(amount - paid_amount, 0)) FILTER (WHERE status = 'overdue'), 0)::bigint AS overdue_amount,
         min(due_date) FILTER (WHERE status NOT IN ('waived', 'cancelled', 'rescheduled', 'paid')) AS next_due
       FROM billing.installment WHERE tenant_id = $1 AND booking_id = $2`,
      [tenantId, bookingId],
    );
    return {
      installmentsTotal: r.total,
      installmentsPaid: r.paid,
      installmentsDue: r.due,
      installmentsOverdue: r.overdue,
      installmentsUpcoming: r.upcoming,
      receivedAmount: r.received,
      pendingAmount: r.pending,
      overdueAmount: r.overdue_amount,
      fineAmount: r.fine,
      nextDueDate: r.next_due,
      escalated: r.overdue >= escalationMissed,
    };
  }

  async bookingsWithOverdue(tenantId) {
    const rows = await this.manager.query(
      "SELECT DISTINCT booking_id FROM billing.installment WHERE tenant_id = $1 AND status = 'overdue'",
      [tenantId],
    );
    return rows.map((r) => r.booking_id);
  }
}
