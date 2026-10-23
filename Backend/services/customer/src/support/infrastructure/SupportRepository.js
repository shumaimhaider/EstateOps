const UUID = /^[0-9a-f-]{36}$/i;
const toRequest = (r) =>
  r
    ? {
        id: r.id,
        tenantId: r.tenant_id,
        customerId: r.customer_id,
        bookingId: r.booking_id,
        subject: r.subject,
        status: r.status,
        createdAt: r.created_at,
        lastMessageAt: r.last_message_at,
        closedAt: r.closed_at,
        customerName: r.customer_name,
        messageCount: r.message_count === undefined ? undefined : Number(r.message_count),
      }
    : null;
const toMessage = (r) => ({
  id: r.id,
  requestId: r.request_id,
  authorKind: r.author_kind,
  authorName: r.author_name,
  body: r.body,
  createdAt: r.created_at,
});

export class SupportRepository {
  constructor(manager) {
    this.manager = manager;
  }

  async insert(request, message) {
    await this.manager.query(
      `INSERT INTO customer.support_request (id, tenant_id, customer_id, booking_id, subject, status, created_at, last_message_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
      [
        request.id,
        request.tenantId,
        request.customerId,
        request.bookingId,
        request.subject,
        request.status,
        request.createdAt,
      ],
    );
    await this.addMessage(message);
  }

  async addMessage(m) {
    await this.manager.query(
      'INSERT INTO customer.support_message (id, tenant_id, request_id, author_kind, author_name, body, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [m.id, m.tenantId, m.requestId, m.authorKind, m.authorName, m.body, m.createdAt],
    );
  }

  async save(request) {
    await this.manager.query(
      'UPDATE customer.support_request SET status = $3, last_message_at = $4, closed_at = $5 WHERE tenant_id = $1 AND id = $2',
      [request.tenantId, request.id, request.status, request.lastMessageAt, request.closedAt],
    );
  }

  async findById(tenantId, id, { lock = false } = {}) {
    if (!UUID.test(String(id))) return null;
    const rows = await this.manager.query(
      `SELECT r.*, c.full_name AS customer_name FROM customer.support_request r
         JOIN customer.customer c ON c.id = r.customer_id
        WHERE r.tenant_id = $1 AND r.id = $2 ${lock ? 'FOR UPDATE OF r' : ''}`,
      [tenantId, id],
    );
    return toRequest(rows[0]);
  }

  async messages(requestId) {
    return (
      await this.manager.query(
        'SELECT * FROM customer.support_message WHERE request_id = $1 ORDER BY created_at, id',
        [requestId],
      )
    ).map(toMessage);
  }

  async countOpen(tenantId, customerId) {
    const rows = await this.manager.query(
      "SELECT count(*)::int AS n FROM customer.support_request WHERE tenant_id = $1 AND customer_id = $2 AND status <> 'closed'",
      [tenantId, customerId],
    );
    return rows[0].n;
  }

  /** Newest activity first, keyset-paged on (last_message_at, id). `customerId` limits to one customer. */
  async list(tenantId, { customerId, status, q, cursor, limit = 25 }) {
    const where = ['r.tenant_id = $1'];
    const args = [tenantId];
    const add = (sql, value) => {
      args.push(value);
      where.push(sql.replaceAll('?', `$${args.length}`));
    };
    if (customerId) add('r.customer_id = ?', customerId);
    if (status) add('r.status = ?', status);
    if (q)
      add(
        "(r.subject ILIKE '%' || ? || '%' OR c.full_name ILIKE '%' || ? || '%')",
        q.replace(/[\\%_]/g, '\\$&'),
      );
    if (cursor) {
      args.push(cursor.at, cursor.id);
      where.push(`(r.last_message_at, r.id) < ($${args.length - 1}, $${args.length})`);
    }
    args.push(limit + 1);
    const rows = await this.manager.query(
      `SELECT r.*, c.full_name AS customer_name,
              (SELECT count(*) FROM customer.support_message m WHERE m.request_id = r.id) AS message_count
         FROM customer.support_request r JOIN customer.customer c ON c.id = r.customer_id
        WHERE ${where.join(' AND ')} ORDER BY r.last_message_at DESC, r.id DESC LIMIT $${args.length}`,
      args,
    );
    const items = rows.slice(0, limit).map(toRequest);
    const last = items.at(-1);
    return { items, next: rows.length > limit ? { at: last.lastMessageAt, id: last.id } : null };
  }

  /** Open and answered requests waiting on staff or the customer, for the nav badge. */
  async countWaiting(tenantId) {
    const rows = await this.manager.query(
      "SELECT count(*)::int AS n FROM customer.support_request WHERE tenant_id = $1 AND status = 'open'",
      [tenantId],
    );
    return rows[0].n;
  }
}
