import { EntitySchema } from 'typeorm';
import { ConflictError, parseSort } from '@estateops/kernel';
import {
  createQuery,
  keysetSql,
  likeContains,
  pgConstraint,
  pgCode,
  updateVersioned,
} from '@estateops/platform';
import { BOOKING_SORT_FIELDS } from '../application/ListBookings.js';

const col = (type, extra = {}) => ({ type, ...extra });
export const BookingRow = new EntitySchema({
  name: 'BookingRow',
  tableName: 'booking',
  schema: 'sales',
  columns: {
    id: col('uuid', { primary: true }),
    tenant_id: col('uuid'),
    unit_id: col('uuid'),
    customer_id: col('uuid'),
    plan_id: col('uuid'),
    plan_name: col('text'),
    down_pct: col('int'),
    installment_count: col('int'),
    status: col('text'),
    total_price: col('bigint'),
    currency: col('char', { length: 3 }),
    booked_at: col('date'),
    cancel_reason: col('text', { nullable: true }),
    unit_no: col('text'),
    unit_kind: col('text'),
    project_id: col('uuid'),
    project_name: col('text'),
    buyer_name: col('text'),
    buyer_phone: col('text', { nullable: true }),
    buyer_email: col('text', { nullable: true }),
    installments_total: col('int'),
    installments_paid: col('int'),
    installments_due: col('int'),
    installments_overdue: col('int'),
    installments_upcoming: col('int'),
    received_amount: col('bigint'),
    pending_amount: col('bigint'),
    overdue_amount: col('bigint'),
    fine_amount: col('bigint'),
    next_due_date: col('date', { nullable: true }),
    escalated: col('boolean'),
    summary_seq: col('int'),
    created_by: col('uuid', { nullable: true }),
    created_at: col('timestamptz', { insert: false, update: false }),
    updated_at: col('timestamptz', { insert: false }),
    version: col('int', { insert: false }),
  },
});

const n = Number;
export const toBooking = (r) => ({
  id: r.id,
  tenantId: r.tenant_id,
  unitId: r.unit_id,
  customerId: r.customer_id,
  planId: r.plan_id,
  planName: r.plan_name,
  downPct: r.down_pct,
  installmentCount: r.installment_count,
  status: r.status,
  totalPrice: n(r.total_price),
  currency: r.currency.trim(),
  bookedAt: typeof r.booked_at === 'string' ? r.booked_at : r.booked_at.toISOString().slice(0, 10),
  cancelReason: r.cancel_reason,
  unitNo: r.unit_no,
  unitKind: r.unit_kind,
  projectId: r.project_id,
  projectName: r.project_name,
  buyerName: r.buyer_name,
  buyerPhone: r.buyer_phone,
  buyerEmail: r.buyer_email,
  installmentsTotal: r.installments_total,
  installmentsPaid: r.installments_paid,
  installmentsDue: r.installments_due,
  installmentsOverdue: r.installments_overdue,
  installmentsUpcoming: r.installments_upcoming,
  receivedAmount: n(r.received_amount),
  pendingAmount: n(r.pending_amount),
  overdueAmount: n(r.overdue_amount),
  fineAmount: n(r.fine_amount),
  nextDueDate: r.next_due_date
    ? typeof r.next_due_date === 'string'
      ? r.next_due_date
      : r.next_due_date.toISOString().slice(0, 10)
    : null,
  escalated: r.escalated,
  summarySeq: r.summary_seq,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  version: r.version,
});

const SORTS = {
  unit_no: { expr: 'b.unit_no', cast: 'text', pick: (r) => r.unit_no },
  total_price: { expr: 'b.total_price', cast: 'bigint', pick: (r) => r.total_price },
  received_amount: { expr: 'b.received_amount', cast: 'bigint', pick: (r) => r.received_amount },
  pending_amount: { expr: 'b.pending_amount', cast: 'bigint', pick: (r) => r.pending_amount },
  overdue_amount: { expr: 'b.overdue_amount', cast: 'bigint', pick: (r) => r.overdue_amount },
  booked_at: {
    expr: 'b.booked_at',
    cast: 'date',
    pick: (r) =>
      typeof r.booked_at === 'string' ? r.booked_at : r.booked_at.toISOString().slice(0, 10),
  },
  next_due_date: {
    expr: "coalesce(b.next_due_date, DATE '9999-12-31')",
    cast: 'date',
    pick: (r) =>
      r.next_due_date
        ? typeof r.next_due_date === 'string'
          ? r.next_due_date
          : r.next_due_date.toISOString().slice(0, 10)
        : '9999-12-31',
  },
};

export class BookingRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
    this.repo = manager.getRepository(BookingRow);
  }

  async insert(b) {
    try {
      await this.repo.insert({
        id: b.id,
        tenant_id: b.tenantId,
        unit_id: b.unitId,
        customer_id: b.customerId,
        plan_id: b.planId,
        plan_name: b.planName,
        down_pct: b.downPct,
        installment_count: b.installmentCount,
        status: b.status,
        total_price: b.totalPrice,
        currency: b.currency,
        booked_at: b.bookedAt,
        cancel_reason: b.cancelReason,
        unit_no: b.unitNo,
        unit_kind: b.unitKind,
        project_id: b.projectId,
        project_name: b.projectName,
        buyer_name: b.buyerName,
        buyer_phone: b.buyerPhone,
        buyer_email: b.buyerEmail,
        installments_total: b.installmentsTotal,
        installments_paid: b.installmentsPaid,
        installments_due: b.installmentsDue,
        installments_overdue: b.installmentsOverdue,
        installments_upcoming: b.installmentsUpcoming,
        received_amount: b.receivedAmount,
        pending_amount: b.pendingAmount,
        overdue_amount: b.overdueAmount,
        fine_amount: b.fineAmount,
        next_due_date: b.nextDueDate,
        escalated: b.escalated,
        summary_seq: b.summarySeq,
        created_by: b.createdBy,
      });
    } catch (error) {
      // the partial unique index: a unit has at most one live booking, even under a race
      if (pgCode(error) === '23505' && pgConstraint(error) === 'booking_unit_live_uq') {
        throw new ConflictError('UNIT_ALREADY_BOOKED', 'This unit already has a booking');
      }
      throw error;
    }
    return b;
  }

  async findById(tenantId, id, { lock = false } = {}) {
    const qb = this.repo
      .createQueryBuilder('b')
      .where('b.id = :id AND b.tenant_id = :tenantId', { id, tenantId });
    if (lock) qb.setLock('pessimistic_write');
    const row = await qb.getOne();
    return row ? toBooking(row) : null;
  }

  async hasLiveBookingForUnit(unitId) {
    const rows = await this.manager.query(
      "SELECT 1 FROM sales.booking WHERE unit_id = $1 AND status IN ('requested', 'confirmed', 'active', 'completed') LIMIT 1",
      [unitId],
    );
    return rows.length > 0;
  }

  async update(b) {
    const version = await updateVersioned(this.manager, BookingRow, {
      where: { id: b.id, tenant_id: b.tenantId },
      version: b.version,
      set: {
        status: b.status,
        cancel_reason: b.cancelReason,
        installments_total: b.installmentsTotal,
        installments_paid: b.installmentsPaid,
        installments_due: b.installmentsDue,
        installments_overdue: b.installmentsOverdue,
        installments_upcoming: b.installmentsUpcoming,
        received_amount: b.receivedAmount,
        pending_amount: b.pendingAmount,
        overdue_amount: b.overdueAmount,
        fine_amount: b.fineAmount,
        next_due_date: b.nextDueDate,
        escalated: b.escalated,
        summary_seq: b.summarySeq,
      },
    });
    return { ...b, version };
  }

  async list(
    tenantId,
    { q, status, kind, projectId, unitId, customerId, escalated, sort, cursor, limit },
  ) {
    const picked = parseSort(sort, BOOKING_SORT_FIELDS, { field: 'booked_at', dir: 'desc' });
    const sorter = SORTS[picked.field];
    const query = createQuery();
    query.and('b.tenant_id = ?', tenantId);
    if (status) query.and('b.status = ?', status);
    if (kind) query.and('b.unit_kind = ?', kind);
    if (projectId) query.and('b.project_id = ?', projectId);
    if (unitId) query.and('b.unit_id = ?', unitId);
    if (customerId) query.and('b.customer_id = ?', customerId);
    if (escalated) query.and('b.escalated');
    if (q?.trim()) {
      const like = likeContains(q.trim());
      query.and(
        '(b.unit_no ILIKE ? OR b.buyer_name ILIKE ? OR b.project_name ILIKE ?)',
        like,
        like,
        like,
      );
    }
    const page = await keysetSql(this.manager, {
      select: 'b.*',
      from: 'FROM sales.booking b',
      query,
      sort: { expr: sorter.expr, dir: picked.dir, cast: sorter.cast },
      idExpr: 'b.id',
      cursor,
      limit,
      valueOf: (r) => String(sorter.pick(r)),
      idOf: (r) => r.id,
    });
    return { items: page.rows.map(toBooking), nextCursor: page.nextCursor };
  }

  async refreshUnitNames(tenantId, unitId, { unitNo, projectName }) {
    await this.manager.query(
      'UPDATE sales.booking SET unit_no = $3, project_name = $4 WHERE tenant_id = $1 AND unit_id = $2 AND (unit_no <> $3 OR project_name <> $4)',
      [tenantId, unitId, unitNo, projectName],
    );
  }

  async refreshBuyer(tenantId, customerId, { name, phone, email }) {
    await this.manager.query(
      `UPDATE sales.booking SET buyer_name = $3, buyer_phone = $4, buyer_email = $5
        WHERE tenant_id = $1 AND customer_id = $2 AND (buyer_name <> $3 OR buyer_phone IS DISTINCT FROM $4 OR buyer_email IS DISTINCT FROM $5)`,
      [tenantId, customerId, name, phone, email],
    );
  }
}
