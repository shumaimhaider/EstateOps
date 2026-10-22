import { createQuery, keysetSql } from '@estateops/platform';

const toEscalation = (r) => ({
  id: r.booking_id,
  bookingId: r.booking_id,
  unitId: r.unit_id,
  unitNo: r.unit_no,
  unitKind: r.unit_kind,
  projectName: r.project_name,
  customerId: r.customer_id,
  buyerName: r.buyer_name,
  buyerPhone: r.customer_phone,
  currency: r.currency.trim(),
  missedInstallments: r.missed,
  overdueAmount: r.overdue_amount,
  fineAmount: r.fine_amount,
  oldestDueDate: r.oldest_due_date,
  noticeSentAt: r.notice_sent_at,
  createdAt: r.created_at,
});

/** One row per booking with `threshold` or more overdue invoices. `extra` narrows to one booking. */
const cases = (extra = '') => `FROM (
  SELECT b.booking_id, b.unit_id, b.unit_no, b.unit_kind, b.project_name, b.customer_id, b.customer_name AS buyer_name,
         b.customer_phone, b.currency, b.created_at,
         count(*)::int AS missed,
         sum(GREATEST(i.amount - i.paid_amount, 0))::bigint AS overdue_amount,
         sum(i.fine_amount)::bigint AS fine_amount,
         min(i.due_date) AS oldest_due_date,
         n.sent_at AS notice_sent_at
    FROM billing.booking_ref b
    JOIN billing.installment i ON i.booking_id = b.booking_id AND i.status = 'overdue'
    LEFT JOIN billing.escalation_notice n ON n.booking_id = b.booking_id
   WHERE b.tenant_id = ? AND b.status <> 'cancelled'${extra}
   GROUP BY b.booking_id, n.sent_at
  HAVING count(*) >= ?) e`;

export class EscalationRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  /** Longest overdue first (oldest unpaid due date), then by id. */
  async list(tenantId, threshold, { cursor, limit }) {
    const query = createQuery();
    const from = query.sql(cases(), tenantId, threshold);
    const page = await keysetSql(this.manager, {
      select: 'e.*',
      from,
      query,
      sort: { expr: 'e.oldest_due_date', dir: 'asc', cast: 'date' },
      idExpr: 'e.booking_id',
      cursor,
      limit,
      valueOf: (r) => String(r.oldest_due_date),
      idOf: (r) => r.booking_id,
    });
    return { items: page.rows.map(toEscalation), nextCursor: page.nextCursor };
  }

  async findOne(tenantId, bookingId, threshold) {
    const query = createQuery();
    const from = query.sql(cases(' AND b.booking_id = ?'), tenantId, bookingId, threshold);
    const rows = await this.manager.query(`SELECT e.* ${from}`, query.params);
    return rows[0] ? toEscalation(rows[0]) : null;
  }

  async insertNotice({ tenantId, bookingId, sentAt, sentBy, sentByName }) {
    await this.manager.query(
      'INSERT INTO billing.escalation_notice (booking_id, tenant_id, sent_at, sent_by, sent_by_name) VALUES ($1, $2, $3, $4, $5)',
      [bookingId, tenantId, sentAt, sentBy, sentByName],
    );
  }
}
