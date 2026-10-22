import { rowsOf } from '@estateops/platform';

const toRef = (r) => ({
  bookingId: r.booking_id,
  tenantId: r.tenant_id,
  customerId: r.customer_id,
  customerName: r.customer_name,
  customerPhone: r.customer_phone,
  customerEmail: r.customer_email,
  unitId: r.unit_id,
  unitNo: r.unit_no,
  unitKind: r.unit_kind,
  projectId: r.project_id,
  projectName: r.project_name,
  totalPrice: r.total_price,
  currency: r.currency.trim(),
  planName: r.plan_name,
  status: r.status,
  bookedAt: r.booked_at,
  summarySeq: r.summary_seq,
});

/** The booking snapshot billing keeps (from booking.confirmed) plus the summary counter and tombstones. */
export class BookingRefRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  async insert(b) {
    await this.manager.query(
      `INSERT INTO billing.booking_ref
         (booking_id, tenant_id, customer_id, customer_name, customer_phone, customer_email, unit_id, unit_no, unit_kind,
          project_id, project_name, total_price, currency, plan_name, status, booked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        b.bookingId,
        b.tenantId,
        b.customerId,
        b.customerName,
        b.customerPhone,
        b.customerEmail,
        b.unitId,
        b.unitNo,
        b.unitKind,
        b.projectId,
        b.projectName,
        b.totalPrice,
        b.currency,
        b.planName,
        b.status,
        b.bookedAt,
      ],
    );
  }

  async findById(tenantId, bookingId) {
    const rows = await this.manager.query(
      'SELECT * FROM billing.booking_ref WHERE tenant_id = $1 AND booking_id = $2',
      [tenantId, bookingId],
    );
    return rows[0] ? toRef(rows[0]) : null;
  }

  async isCancelled(bookingId) {
    const rows = await this.manager.query(
      'SELECT 1 FROM billing.cancelled_booking WHERE booking_id = $1',
      [bookingId],
    );
    return rows.length > 0;
  }

  async rememberCancelled(tenantId, bookingId) {
    await this.manager.query(
      'INSERT INTO billing.cancelled_booking (booking_id, tenant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [bookingId, tenantId],
    );
  }

  async markCancelled(bookingId) {
    await this.manager.query(
      "UPDATE billing.booking_ref SET status = 'cancelled', updated_at = now() WHERE booking_id = $1",
      [bookingId],
    );
  }

  /** True only for the caller that completes it, so booking.fully_paid is announced once. */
  async markCompleted(bookingId) {
    const rows = rowsOf(
      await this.manager.query(
        "UPDATE billing.booking_ref SET status = 'completed', updated_at = now() WHERE booking_id = $1 AND status = 'active' RETURNING booking_id",
        [bookingId],
      ),
    );
    return rows.length === 1;
  }

  async nextSeq(bookingId) {
    const rows = rowsOf(
      await this.manager.query(
        'UPDATE billing.booking_ref SET summary_seq = summary_seq + 1 WHERE booking_id = $1 RETURNING summary_seq',
        [bookingId],
      ),
    );
    return rows[0].summary_seq;
  }

  async refreshCustomer(tenantId, customerId, { name, phone, email }) {
    await this.manager.query(
      `UPDATE billing.booking_ref SET customer_name = $3, customer_phone = $4, customer_email = $5, updated_at = now()
        WHERE tenant_id = $1 AND customer_id = $2 AND (customer_name <> $3 OR customer_phone IS DISTINCT FROM $4 OR customer_email IS DISTINCT FROM $5)`,
      [tenantId, customerId, name, phone, email],
    );
  }
}
