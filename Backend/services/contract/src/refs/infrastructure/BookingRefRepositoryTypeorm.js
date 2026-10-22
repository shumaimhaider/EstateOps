/** The booking and buyer snapshot contracts are drafted for, from booking.confirmed. */
export class BookingRefRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  async findById(tenantId, bookingId) {
    const rows = await this.manager.query(
      'SELECT * FROM contract.booking_ref WHERE tenant_id = $1 AND booking_id = $2',
      [tenantId, bookingId],
    );
    const r = rows[0];
    return r
      ? {
          bookingId: r.booking_id,
          tenantId: r.tenant_id,
          customerId: r.customer_id,
          customerName: r.customer_name,
          customerEmail: r.customer_email,
          unitNo: r.unit_no,
          cancelled: r.cancelled,
        }
      : null;
  }

  /** A booking that was cancelled (even before it arrived) is never revived by a late confirmation. */
  async upsert(b) {
    await this.manager.query(
      `INSERT INTO contract.booking_ref (booking_id, tenant_id, customer_id, customer_name, customer_email, unit_no)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (booking_id) DO UPDATE SET customer_id = EXCLUDED.customer_id, customer_name = EXCLUDED.customer_name,
         customer_email = EXCLUDED.customer_email, unit_no = EXCLUDED.unit_no, updated_at = now()
         WHERE NOT contract.booking_ref.cancelled`,
      [b.bookingId, b.tenantId, b.customerId, b.customerName, b.customerEmail, b.unitNo],
    );
  }

  /** Marks cancelled; if the booking was never seen, remembers it with empty names (only `cancelled` matters). */
  async markCancelled({ bookingId, tenantId, customerId }) {
    await this.manager.query(
      `INSERT INTO contract.booking_ref (booking_id, tenant_id, customer_id, customer_name, unit_no, cancelled)
       VALUES ($1, $2, $3, '', '', true)
       ON CONFLICT (booking_id) DO UPDATE SET cancelled = true, updated_at = now()`,
      [bookingId, tenantId, customerId],
    );
  }
}
