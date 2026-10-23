import { parseSort } from '@estateops/kernel';
import { createQuery, keysetSql, likeContains, rowsOf, updateVersioned } from '@estateops/platform';
import { INSTALLMENT_SORT_FIELDS } from '../application/ListInstallments.js';
import { InstallmentRow } from './entities.js';

export const toInvoice = (r) => ({
  id: r.id,
  tenantId: r.tenant_id,
  bookingId: r.booking_id,
  seq: r.seq,
  kind: r.kind,
  invoiceNo: r.invoice_no,
  issuedOn: r.issued_on,
  dueDate: r.due_date,
  amount: r.amount,
  originalAmount: r.original_amount,
  paidAmount: r.paid_amount,
  fineAmount: r.fine_amount,
  status: r.status,
  paidAt: r.paid_at,
  method: r.method,
  paymentSource: r.payment_source,
  receivedOn: r.received_on,
  paymentReference: r.payment_reference,
  receiptNo: r.receipt_no,
  adjustmentReason: r.adjustment_reason,
  projectId: r.project_id,
  customerId: r.customer_id,
  unitId: r.unit_id,
  unitKind: r.unit_kind,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  version: r.version,
});

const toView = (r) => ({
  invoice: toInvoice(r),
  unitNo: r.unit_no,
  projectName: r.project_name,
  buyerName: r.buyer_name,
  currency: r.currency.trim(),
});

const VIEW_FROM =
  'FROM billing.installment i JOIN billing.booking_ref b ON b.booking_id = i.booking_id';
const VIEW_SELECT = 'i.*, b.unit_no, b.project_name, b.customer_name AS buyer_name, b.currency';
const BALANCE =
  "CASE WHEN i.status IN ('waived', 'cancelled', 'rescheduled') THEN 0 ELSE GREATEST(i.amount - i.paid_amount, 0) END";

const SORTS = {
  due_date: { expr: 'i.due_date', cast: 'date', pick: (r) => r.due_date },
  amount: { expr: 'i.amount', cast: 'bigint', pick: (r) => r.amount },
  balance: {
    expr: BALANCE,
    cast: 'bigint',
    pick: (r) =>
      ['waived', 'cancelled', 'rescheduled'].includes(r.status)
        ? 0
        : Math.max(r.amount - r.paid_amount, 0),
  },
  status: { expr: 'i.status', cast: 'text', pick: (r) => r.status },
  invoice_no: { expr: 'i.invoice_no', cast: 'text', pick: (r) => r.invoice_no },
  seq: { expr: 'i.seq', cast: 'int', pick: (r) => r.seq },
};

export class InstallmentRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
    this.repo = manager.getRepository(InstallmentRow);
  }

  async insertMany(invoices) {
    if (invoices.length === 0) return;
    await this.repo.insert(
      invoices.map((i) => ({
        id: i.id,
        tenant_id: i.tenantId,
        booking_id: i.bookingId,
        seq: i.seq,
        kind: i.kind,
        invoice_no: i.invoiceNo,
        issued_on: i.issuedOn,
        due_date: i.dueDate,
        amount: i.amount,
        original_amount: i.originalAmount,
        paid_amount: i.paidAmount,
        fine_amount: i.fineAmount,
        status: i.status,
        project_id: i.projectId,
        customer_id: i.customerId,
        unit_id: i.unitId,
        unit_kind: i.unitKind,
      })),
    );
  }

  async findById(tenantId, id, { lock = false } = {}) {
    if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
    const qb = this.repo
      .createQueryBuilder('i')
      .where('i.id = :id AND i.tenant_id = :tenantId', { id, tenantId });
    if (lock) qb.setLock('pessimistic_write');
    const row = await qb.getOne();
    return row ? toInvoice(row) : null;
  }

  async findView(tenantId, id) {
    if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
    const rows = await this.manager.query(
      `SELECT ${VIEW_SELECT} ${VIEW_FROM} WHERE i.tenant_id = $1 AND i.id = $2`,
      [tenantId, id],
    );
    return rows[0] ? toView(rows[0]) : null;
  }

  async update(i) {
    const version = await updateVersioned(this.manager, InstallmentRow, {
      where: { id: i.id, tenant_id: i.tenantId },
      version: i.version,
      set: {
        amount: i.amount,
        paid_amount: i.paidAmount,
        status: i.status,
        paid_at: i.paidAt,
        method: i.method,
        payment_source: i.paymentSource,
        received_on: i.receivedOn,
        payment_reference: i.paymentReference,
        receipt_no: i.receiptNo,
        adjustment_reason: i.adjustmentReason,
      },
    });
    return { ...i, version };
  }

  async list(tenantId, f) {
    const picked = parseSort(f.sort, INSTALLMENT_SORT_FIELDS, { field: 'due_date', dir: 'asc' });
    const sorter = SORTS[picked.field];
    const query = createQuery();
    query.and('i.tenant_id = ?', tenantId);
    if (f.status) query.and('i.status = ?', f.status);
    if (f.bookingId) query.and('i.booking_id = ?', f.bookingId);
    if (f.customerId) query.and('i.customer_id = ?', f.customerId);
    if (f.projectId) query.and('i.project_id = ?', f.projectId);
    if (f.unitKind) query.and('i.unit_kind = ?', f.unitKind);
    if (f.dueFrom) query.and('i.due_date >= ?::date', f.dueFrom);
    if (f.dueTo) query.and('i.due_date <= ?::date', f.dueTo);
    if (f.q?.trim()) {
      const like = likeContains(f.q.trim());
      query.and(
        "(i.invoice_no ILIKE ? OR b.unit_no ILIKE ? OR b.customer_name ILIKE ? OR coalesce(i.payment_reference, '') ILIKE ?)",
        like,
        like,
        like,
        like,
      );
    }
    const page = await keysetSql(this.manager, {
      select: VIEW_SELECT,
      from: VIEW_FROM,
      query,
      sort: { expr: sorter.expr, dir: picked.dir, cast: sorter.cast },
      idExpr: 'i.id',
      cursor: f.cursor,
      limit: f.limit,
      valueOf: (r) => String(sorter.pick(r)),
      idOf: (r) => r.id,
    });
    return { items: page.rows.map(toView), nextCursor: page.nextCursor };
  }

  /** Tenants that have unpaid invoices past their due date. */
  async tenantsToSweep(today) {
    const rows = await this.manager.query(
      "SELECT DISTINCT tenant_id FROM billing.installment WHERE status IN ('scheduled', 'due') AND due_date < $1::date",
      [today],
    );
    return rows.map((r) => r.tenant_id);
  }

  /**
   * Moves one batch: scheduled past due date -> due, past the grace -> overdue. Locks rows with
   * SKIP LOCKED so parallel sweeps never touch the same invoice. Returns what moved.
   */
  async sweepBatch(tenantId, today, graceDays, limit) {
    const result = await this.manager.query(
      `WITH batch AS (
         SELECT id FROM billing.installment
          WHERE tenant_id = $1 AND status IN ('scheduled', 'due') AND due_date < $2::date
            AND (CASE WHEN due_date + $3::int < $2::date THEN 'overdue' ELSE 'due' END) <> status
          ORDER BY due_date, id LIMIT $4 FOR UPDATE SKIP LOCKED)
       UPDATE billing.installment i
          SET status = CASE WHEN i.due_date + $3::int < $2::date THEN 'overdue' ELSE 'due' END, updated_at = now(), version = i.version + 1
         FROM batch WHERE i.id = batch.id
       RETURNING i.id, i.booking_id, i.status`,
      [tenantId, today, graceDays, limit],
    );
    return rowsOf(result).map((r) => ({ id: r.id, bookingId: r.booking_id, status: r.status }));
  }

  /** Has any money been received on this booking? The authority sales asks before it cancels one. */
  async hasPayments(tenantId, bookingId) {
    const rows = await this.manager.query(
      'SELECT 1 FROM billing.installment WHERE tenant_id = $1 AND booking_id = $2 AND paid_amount > 0 LIMIT 1',
      [tenantId, bookingId],
    );
    return rowsOf(rows).length > 0;
  }

  async cancelUnpaidOfBooking(tenantId, bookingId) {
    const result = await this.manager.query(
      `UPDATE billing.installment SET status = 'cancelled', updated_at = now(), version = version + 1
        WHERE tenant_id = $1 AND booking_id = $2 AND status IN ('scheduled', 'due', 'overdue') AND paid_amount = 0
        RETURNING id`,
      [tenantId, bookingId],
    );
    return rowsOf(result).length;
  }
}
