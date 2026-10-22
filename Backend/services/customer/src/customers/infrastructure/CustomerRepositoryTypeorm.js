import { ConflictError, parseSort } from '@estateops/kernel';
import { createQuery, keysetSql, likeContains, pgCode, updateVersioned } from '@estateops/platform';
import { CUSTOMER_SORT_FIELDS } from '../application/ListCustomers.js';
import { CustomerRow } from './entities.js';

const big = (v) => Number(v);

export const toCustomer = (r) => ({
  id: r.id,
  tenantId: r.tenant_id,
  fullName: r.full_name,
  phone: r.phone,
  email: r.email,
  idNumber: r.id_number,
  city: r.city,
  preferredLanguage: r.preferred_language,
  bookingsCount: r.bookings_count,
  totalValue: big(r.total_value),
  receivedAmount: big(r.received_amount),
  pendingAmount: big(r.pending_amount),
  overdueAmount: big(r.overdue_amount),
  escalatedCount: r.escalated_count,
  unitsSummary: r.units_summary ?? [],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  version: r.version,
});

const SORTS = {
  full_name: { expr: 'lower(c.full_name)', cast: 'text', pick: (r) => r.full_name.toLowerCase() },
  bookings_count: { expr: 'c.bookings_count', cast: 'int', pick: (r) => r.bookings_count },
  total_value: { expr: 'c.total_value', cast: 'bigint', pick: (r) => r.total_value },
  received_amount: { expr: 'c.received_amount', cast: 'bigint', pick: (r) => r.received_amount },
  pending_amount: { expr: 'c.pending_amount', cast: 'bigint', pick: (r) => r.pending_amount },
  overdue_amount: { expr: 'c.overdue_amount', cast: 'bigint', pick: (r) => r.overdue_amount },
};

const taken = (error) => {
  if (pgCode(error) === '23505')
    throw new ConflictError('EMAIL_TAKEN', 'A customer with this email already exists');
  throw error;
};

export class CustomerRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
    this.repo = manager.getRepository(CustomerRow);
  }

  async insert(c) {
    await this.repo
      .insert({
        id: c.id,
        tenant_id: c.tenantId,
        full_name: c.fullName,
        phone: c.phone,
        email: c.email,
        id_number: c.idNumber,
        city: c.city,
        preferred_language: c.preferredLanguage,
      })
      .catch(taken);
    return c;
  }

  async findById(tenantId, id) {
    const row = await this.manager.query(
      'SELECT * FROM customer.customer WHERE tenant_id = $1 AND id = $2',
      [tenantId, id],
    );
    return row[0] ? toCustomer(row[0]) : null;
  }

  async emailTaken(tenantId, email) {
    const rows = await this.manager.query(
      'SELECT 1 FROM customer.customer WHERE tenant_id = $1 AND lower(email) = lower($2) LIMIT 1',
      [tenantId, email],
    );
    return rows.length > 0;
  }

  async update(c) {
    const version = await updateVersioned(this.manager, CustomerRow, {
      where: { id: c.id, tenant_id: c.tenantId },
      version: c.version,
      set: {
        full_name: c.fullName,
        phone: c.phone,
        email: c.email,
        id_number: c.idNumber,
        city: c.city,
        preferred_language: c.preferredLanguage,
      },
    }).catch(taken);
    return { ...c, version };
  }

  async delete(tenantId, id) {
    await this.repo.delete({ id, tenant_id: tenantId });
  }

  async hasSummaries(tenantId, id) {
    const rows = await this.manager.query(
      'SELECT 1 FROM customer.booking_summary WHERE tenant_id = $1 AND customer_id = $2 LIMIT 1',
      [tenantId, id],
    );
    return rows.length > 0;
  }

  async list(tenantId, { q, hasOverdue, sort, cursor, limit }) {
    const picked = parseSort(sort, CUSTOMER_SORT_FIELDS, { field: 'full_name', dir: 'asc' });
    const sorter = SORTS[picked.field];
    const query = createQuery();
    query.and('c.tenant_id = ?', tenantId);
    if (hasOverdue) query.and('c.overdue_amount > 0');
    if (q?.trim()) {
      const like = likeContains(q.trim());
      query.and(
        "(c.full_name ILIKE ? OR coalesce(c.phone, '') ILIKE ? OR coalesce(c.email, '') ILIKE ? OR array_to_string(c.units_summary, ' ') ILIKE ?)",
        like,
        like,
        like,
        like,
      );
    }
    const page = await keysetSql(this.manager, {
      select: 'c.*',
      from: 'FROM customer.customer c',
      query,
      sort: { expr: sorter.expr, dir: picked.dir, cast: sorter.cast },
      idExpr: 'c.id',
      cursor,
      limit,
      valueOf: (r) => String(sorter.pick(r)),
      idOf: (r) => r.id,
    });
    return { items: page.rows.map(toCustomer), nextCursor: page.nextCursor };
  }

  /** Totals are always sums over the customer's live bookings, recomputed in one statement. */
  async recomputeTotals(tenantId, customerId) {
    await this.manager.query(
      `UPDATE customer.customer c SET
         bookings_count = s.n, total_value = s.total, received_amount = s.received, pending_amount = s.pending,
         overdue_amount = s.overdue, escalated_count = s.escalated, units_summary = s.units, updated_at = now()
       FROM (SELECT count(*) FILTER (WHERE NOT cancelled)::int AS n,
                    coalesce(sum(total_price) FILTER (WHERE NOT cancelled), 0) AS total,
                    coalesce(sum(received_amount) FILTER (WHERE NOT cancelled), 0) AS received,
                    coalesce(sum(pending_amount) FILTER (WHERE NOT cancelled), 0) AS pending,
                    coalesce(sum(overdue_amount) FILTER (WHERE NOT cancelled), 0) AS overdue,
                    (count(*) FILTER (WHERE NOT cancelled AND escalated))::int AS escalated,
                    coalesce(array_agg(unit_no ORDER BY unit_no) FILTER (WHERE NOT cancelled), '{}') AS units
               FROM customer.booking_summary WHERE tenant_id = $1 AND customer_id = $2) s
       WHERE c.tenant_id = $1 AND c.id = $2`,
      [tenantId, customerId],
    );
  }
}

export class BookingSummaryRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  /** True when the summary was written. An older `seq` than the stored one changes nothing. */
  async upsert(s) {
    const rows = await this.manager.query(
      `INSERT INTO customer.booking_summary
         (booking_id, tenant_id, customer_id, unit_no, total_price, currency, received_amount, pending_amount, overdue_amount, escalated, seq)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (booking_id) DO UPDATE SET
         unit_no = EXCLUDED.unit_no, total_price = EXCLUDED.total_price, currency = EXCLUDED.currency,
         received_amount = EXCLUDED.received_amount, pending_amount = EXCLUDED.pending_amount,
         overdue_amount = EXCLUDED.overdue_amount, escalated = EXCLUDED.escalated, seq = EXCLUDED.seq, updated_at = now()
         WHERE customer.booking_summary.seq < EXCLUDED.seq AND NOT customer.booking_summary.cancelled
       RETURNING booking_id`,
      [
        s.bookingId,
        s.tenantId,
        s.customerId,
        s.unitNo,
        s.totalPrice,
        s.currency,
        s.receivedAmount,
        s.pendingAmount,
        s.overdueAmount,
        s.escalated,
        s.seq,
      ],
    );
    return rows.length === 1;
  }

  async markCancelled(tenantId, bookingId) {
    await this.manager.query(
      'UPDATE customer.booking_summary SET cancelled = true, updated_at = now() WHERE tenant_id = $1 AND booking_id = $2',
      [tenantId, bookingId],
    );
  }
}
