import { ConflictError } from '@estateops/kernel';
import { pgCode, pgConstraint } from '@estateops/platform';

const UUID = /^[0-9a-f-]{36}$/i;
const first = (rows) => rows[0] ?? null;

const toMethod = (r) =>
  r && {
    id: r.id,
    tenantId: r.tenant_id,
    customerId: r.customer_id,
    stripePaymentMethodId: r.stripe_payment_method_id,
    brand: r.brand,
    last4: r.last4,
    expMonth: r.exp_month,
    expYear: r.exp_year,
    fingerprint: r.fingerprint,
    isActive: r.is_active,
    status: r.status,
    addedByName: r.added_by_name,
    addedVia: r.added_via,
    createdAt: r.created_at,
  };

const toCheckout = (r) =>
  r && {
    id: r.id,
    tenantId: r.tenant_id,
    purpose: r.purpose,
    customerId: r.customer_id,
    installmentId: r.installment_id,
    stripeSessionId: r.stripe_session_id,
    amount: r.amount === null ? null : Number(r.amount),
    currency: r.currency,
    adjustedAmount: r.adjusted_amount === null ? null : Number(r.adjusted_amount),
    adjustmentReason: r.adjustment_reason,
    saveCard: r.save_card,
    status: r.status,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdVia: r.created_via,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };

const toTransaction = (r) =>
  r && {
    id: r.id,
    tenantId: r.tenant_id,
    installmentId: r.installment_id,
    bookingId: r.booking_id,
    customerId: r.customer_id,
    checkoutSessionId: r.checkout_session_id,
    paymentMethodId: r.payment_method_id,
    trigger: r.trigger,
    amount: Number(r.amount),
    currency: r.currency,
    status: r.status,
    stripePaymentIntentId: r.stripe_payment_intent_id,
    stripeChargeId: r.stripe_charge_id,
    stripeRefundId: r.stripe_refund_id,
    cardBrand: r.card_brand,
    cardLast4: r.card_last4,
    failureCode: r.failure_code,
    failureMessage: r.failure_message,
    stripeResponse: r.stripe_response,
    paymentId: r.payment_id,
    idempotencyKey: r.idempotency_key,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };

export class StripeCustomerRepository {
  constructor(manager) {
    this.manager = manager;
  }

  async find(tenantId, customerId) {
    const r = first(
      await this.manager.query(
        'SELECT stripe_customer_id FROM billing.stripe_customer WHERE tenant_id = $1 AND customer_id = $2',
        [tenantId, customerId],
      ),
    );
    return r ? r.stripe_customer_id : null;
  }

  /** Keeps the first link if two requests race; returns the one that is stored. */
  async save(tenantId, customerId, stripeCustomerId) {
    await this.manager.query(
      `INSERT INTO billing.stripe_customer (tenant_id, customer_id, stripe_customer_id) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, customer_id) DO NOTHING`,
      [tenantId, customerId, stripeCustomerId],
    );
    return this.find(tenantId, customerId);
  }

  async customerOf(tenantId, stripeCustomerId) {
    const r = first(
      await this.manager.query(
        'SELECT customer_id FROM billing.stripe_customer WHERE tenant_id = $1 AND stripe_customer_id = $2',
        [tenantId, stripeCustomerId],
      ),
    );
    return r ? r.customer_id : null;
  }
}

export class PaymentMethodRepository {
  constructor(manager) {
    this.manager = manager;
  }

  async insert(m) {
    try {
      await this.manager.query(
        `INSERT INTO billing.payment_method (id, tenant_id, customer_id, stripe_payment_method_id, brand, last4,
           exp_month, exp_year, fingerprint, is_active, status, added_by, added_by_name, added_via)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          m.id,
          m.tenantId,
          m.customerId,
          m.stripePaymentMethodId,
          m.brand,
          m.last4,
          m.expMonth,
          m.expYear,
          m.fingerprint,
          m.isActive,
          m.status,
          m.addedBy,
          m.addedByName,
          m.addedVia,
        ],
      );
    } catch (error) {
      if (pgCode(error) === '23505')
        throw new ConflictError('CARD_ALREADY_SAVED', 'This card is already saved');
      throw error;
    }
    return m;
  }

  async findById(tenantId, id) {
    if (!UUID.test(String(id))) return null;
    return toMethod(
      first(
        await this.manager.query(
          'SELECT * FROM billing.payment_method WHERE tenant_id = $1 AND id = $2',
          [tenantId, id],
        ),
      ),
    );
  }

  async findByStripeId(tenantId, stripePaymentMethodId) {
    return toMethod(
      first(
        await this.manager.query(
          'SELECT * FROM billing.payment_method WHERE tenant_id = $1 AND stripe_payment_method_id = $2',
          [tenantId, stripePaymentMethodId],
        ),
      ),
    );
  }

  async findActiveByFingerprint(tenantId, customerId, fingerprint) {
    if (!fingerprint) return null;
    return toMethod(
      first(
        await this.manager.query(
          `SELECT * FROM billing.payment_method WHERE tenant_id = $1 AND customer_id = $2
             AND fingerprint = $3 AND status = 'active'`,
          [tenantId, customerId, fingerprint],
        ),
      ),
    );
  }

  /** A customer's saved cards, the active one first, then newest. Removed cards are not listed. */
  async listForCustomer(tenantId, customerId) {
    return (
      await this.manager.query(
        `SELECT * FROM billing.payment_method WHERE tenant_id = $1 AND customer_id = $2 AND status = 'active'
          ORDER BY is_active DESC, created_at DESC, id`,
        [tenantId, customerId],
      )
    ).map(toMethod);
  }

  async findActive(tenantId, customerId) {
    return toMethod(
      first(
        await this.manager.query(
          'SELECT * FROM billing.payment_method WHERE tenant_id = $1 AND customer_id = $2 AND is_active',
          [tenantId, customerId],
        ),
      ),
    );
  }

  /** Makes one card the active one. The old active card is cleared first so the unique index holds. */
  async setActive(tenantId, customerId, id) {
    await this.manager.query(
      'UPDATE billing.payment_method SET is_active = false WHERE tenant_id = $1 AND customer_id = $2 AND is_active',
      [tenantId, customerId],
    );
    await this.manager.query(
      `UPDATE billing.payment_method SET is_active = true
        WHERE tenant_id = $1 AND customer_id = $2 AND id = $3 AND status = 'active'`,
      [tenantId, customerId, id],
    );
  }

  async markRemoved(tenantId, id) {
    await this.manager.query(
      `UPDATE billing.payment_method SET status = 'removed', is_active = false, removed_at = now()
        WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
  }
}

export class CheckoutSessionRepository {
  constructor(manager) {
    this.manager = manager;
  }

  async insert(c) {
    await this.manager.query(
      `INSERT INTO billing.checkout_session (id, tenant_id, purpose, customer_id, installment_id, stripe_session_id,
         amount, currency, adjusted_amount, adjustment_reason, save_card, status, created_by, created_by_name, created_via)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        c.id,
        c.tenantId,
        c.purpose,
        c.customerId,
        c.installmentId,
        c.stripeSessionId,
        c.amount,
        c.currency,
        c.adjustedAmount,
        c.adjustmentReason,
        c.saveCard,
        c.status,
        c.createdBy,
        c.createdByName,
        c.createdVia,
      ],
    );
    return c;
  }

  async findById(tenantId, id, { lock = false } = {}) {
    if (!UUID.test(String(id))) return null;
    return toCheckout(
      first(
        await this.manager.query(
          `SELECT * FROM billing.checkout_session WHERE tenant_id = $1 AND id = $2 ${lock ? 'FOR UPDATE' : ''}`,
          [tenantId, id],
        ),
      ),
    );
  }

  /** Webhooks only know Stripe's id, not the tenant, so this lookup is global. */
  async findByStripeId(stripeSessionId, { lock = false } = {}) {
    return toCheckout(
      first(
        await this.manager.query(
          `SELECT * FROM billing.checkout_session WHERE stripe_session_id = $1 ${lock ? 'FOR UPDATE' : ''}`,
          [stripeSessionId],
        ),
      ),
    );
  }

  /** By id alone, for jobs and webhooks that already know the row exists. */
  async findByIdAny(id, { lock = false } = {}) {
    if (!UUID.test(String(id))) return null;
    return toCheckout(
      first(
        await this.manager.query(
          `SELECT * FROM billing.checkout_session WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`,
          [id],
        ),
      ),
    );
  }

  async setStatus(id, status) {
    await this.manager.query(
      `UPDATE billing.checkout_session SET status = $2, completed_at = CASE WHEN $2 = 'open' THEN NULL ELSE now() END WHERE id = $1`,
      [id, status],
    );
  }
}

const TX_COLUMNS = {
  status: 'status',
  stripePaymentIntentId: 'stripe_payment_intent_id',
  stripeChargeId: 'stripe_charge_id',
  stripeRefundId: 'stripe_refund_id',
  cardBrand: 'card_brand',
  cardLast4: 'card_last4',
  failureCode: 'failure_code',
  failureMessage: 'failure_message',
  paymentId: 'payment_id',
  completedAt: 'completed_at',
};

export class TransactionRepository {
  constructor(manager) {
    this.manager = manager;
  }

  async insert(t) {
    try {
      await this.manager.query(
        `INSERT INTO billing.payment_transaction (id, tenant_id, installment_id, booking_id, customer_id,
           checkout_session_id, payment_method_id, trigger, amount, currency, status, idempotency_key,
           created_by, created_by_name, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          t.id,
          t.tenantId,
          t.installmentId,
          t.bookingId,
          t.customerId,
          t.checkoutSessionId,
          t.paymentMethodId,
          t.trigger,
          t.amount,
          t.currency,
          t.status,
          t.idempotencyKey,
          t.createdBy,
          t.createdByName,
          t.createdAt,
        ],
      );
    } catch (error) {
      if (pgCode(error) === '23505' && pgConstraint(error) === 'tx_idem_uq') {
        throw new ConflictError('ATTEMPT_ALREADY_MADE', 'This payment attempt was already made');
      }
      throw error;
    }
    return t;
  }

  /** Writes the fields a state change touches, plus Stripe's answer, in one statement. */
  async save(t) {
    const sets = Object.values(TX_COLUMNS).map((column, i) => `${column} = $${i + 3}`);
    const values = Object.keys(TX_COLUMNS).map((key) => t[key]);
    await this.manager.query(
      `UPDATE billing.payment_transaction SET ${sets.join(', ')},
         stripe_response = $${values.length + 3}::jsonb, updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [
        t.tenantId,
        t.id,
        ...values,
        t.stripeResponse === null ? null : JSON.stringify(t.stripeResponse),
      ],
    );
    return t;
  }

  async findById(tenantId, id) {
    if (!UUID.test(String(id))) return null;
    return toTransaction(
      first(
        await this.manager.query(
          'SELECT * FROM billing.payment_transaction WHERE tenant_id = $1 AND id = $2',
          [tenantId, id],
        ),
      ),
    );
  }

  async findByCheckout(checkoutSessionId) {
    return toTransaction(
      first(
        await this.manager.query(
          'SELECT * FROM billing.payment_transaction WHERE checkout_session_id = $1 ORDER BY created_at DESC LIMIT 1',
          [checkoutSessionId],
        ),
      ),
    );
  }

  async findByIdempotencyKey(tenantId, key) {
    return toTransaction(
      first(
        await this.manager.query(
          'SELECT * FROM billing.payment_transaction WHERE tenant_id = $1 AND idempotency_key = $2',
          [tenantId, key],
        ),
      ),
    );
  }

  async findByIntent(stripePaymentIntentId) {
    return toTransaction(
      first(
        await this.manager.query(
          'SELECT * FROM billing.payment_transaction WHERE stripe_payment_intent_id = $1 LIMIT 1',
          [stripePaymentIntentId],
        ),
      ),
    );
  }

  /** Newest first, keyset-paged on (created_at, id). */
  async list(tenantId, { installmentId, customerId, bookingId, status, cursor, limit = 25 }) {
    const where = ['tenant_id = $1'];
    const args = [tenantId];
    const add = (sql, value) => {
      args.push(value);
      where.push(sql.replace('?', `$${args.length}`));
    };
    if (installmentId) add('installment_id = ?', installmentId);
    if (customerId) add('customer_id = ?', customerId);
    if (bookingId) add('booking_id = ?', bookingId);
    if (status) add('status = ?', status);
    if (cursor) {
      args.push(cursor.createdAt, cursor.id);
      where.push(`(created_at, id) < ($${args.length - 1}, $${args.length})`);
    }
    args.push(limit + 1);
    const rows = await this.manager.query(
      `SELECT * FROM billing.payment_transaction WHERE ${where.join(' AND ')}
        ORDER BY created_at DESC, id DESC LIMIT $${args.length}`,
      args,
    );
    const items = rows.slice(0, limit).map(toTransaction);
    const more = rows.length > limit;
    const last = items.at(-1);
    return { items, next: more ? { createdAt: last.createdAt, id: last.id } : null };
  }

  /** How many background charges of this invoice have failed so far. */
  async countFailedScheduled(tenantId, installmentId) {
    const rows = await this.manager.query(
      `SELECT count(*)::int AS n FROM billing.payment_transaction
        WHERE tenant_id = $1 AND installment_id = $2 AND trigger = 'scheduled' AND status = 'failed'`,
      [tenantId, installmentId],
    );
    return rows[0].n;
  }

  /** Attempts still pending after `olderThanMs`, for the reconciliation job. */
  async listStalePending(olderThanMs, limit = 50) {
    return (
      await this.manager.query(
        `SELECT * FROM billing.payment_transaction WHERE status = 'pending'
           AND checkout_session_id IS NULL AND created_at < now() - ($1::bigint * interval '1 millisecond')
         ORDER BY created_at LIMIT $2`,
        [olderThanMs, limit],
      )
    ).map(toTransaction);
  }
}

export class StripeEventRepository {
  constructor(manager) {
    this.manager = manager;
  }

  /** True the first time an event id is seen, false for every repeat. */
  async receive(event) {
    const rows = await this.manager.query(
      `INSERT INTO billing.stripe_event (id, type, payload) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [event.id, event.type, JSON.stringify(event)],
    );
    return rows.length > 0;
  }

  /** Drops a received event whose processing failed, so Stripe's retry is processed afresh. */
  async forget(id) {
    await this.manager.query('DELETE FROM billing.stripe_event WHERE id = $1', [id]);
  }

  async finish(id, status, error = null) {
    await this.manager.query(
      'UPDATE billing.stripe_event SET status = $2, error = $3, processed_at = now() WHERE id = $1',
      [id, status, error ? String(error).slice(0, 500) : null],
    );
  }
}

/** What the daily collection scan reads: unpaid invoices that are due and have a usable saved card. */
export class CollectionRepository {
  constructor(manager) {
    this.manager = manager;
  }

  /**
   * Invoices whose due date is `today` or earlier, still unpaid, in an active booking, whose
   * customer's active saved card has not expired, with the history of earlier background charges.
   * Keyset-paged by invoice id.
   */
  async listCollectable(today, { after = null, limit = 500 } = {}) {
    const [year, month] = today.split('-').map(Number);
    const rows = await this.manager.query(
      `SELECT i.id, i.tenant_id, i.booking_id, i.customer_id,
              i.amount - i.paid_amount AS balance, b.currency,
              COALESCE(h.failures, 0)::int AS failures,
              to_char(h.last_failure_on, 'YYYY-MM-DD') AS last_failure_on,
              h.last_failure_code,
              COALESCE(h.in_flight, false) AS in_flight
         FROM billing.installment i
         JOIN billing.booking_ref b ON b.booking_id = i.booking_id AND b.status = 'active'
         JOIN billing.payment_method pm
           ON pm.tenant_id = i.tenant_id AND pm.customer_id = i.customer_id AND pm.is_active AND pm.status = 'active'
          AND (pm.exp_year > $2 OR (pm.exp_year = $2 AND pm.exp_month >= $3))
         LEFT JOIN LATERAL (
           SELECT count(*) FILTER (WHERE t.status = 'failed') AS failures,
                  max(t.created_at) FILTER (WHERE t.status = 'failed')::date AS last_failure_on,
                  (array_agg(t.failure_code ORDER BY t.created_at DESC) FILTER (WHERE t.status = 'failed'))[1] AS last_failure_code,
                  bool_or(t.status = 'pending') AS in_flight
             FROM billing.payment_transaction t
            WHERE t.installment_id = i.id AND t.trigger = 'scheduled'
         ) h ON true
        WHERE i.status IN ('scheduled', 'due', 'overdue') AND i.due_date <= $1::date AND i.paid_amount < i.amount
          AND ($4::uuid IS NULL OR i.id > $4::uuid)
        ORDER BY i.id LIMIT $5`,
      [today, year, month, after, limit],
    );
    return rows.map((r) => ({
      invoiceId: r.id,
      tenantId: r.tenant_id,
      bookingId: r.booking_id,
      customerId: r.customer_id,
      failures: r.failures,
      lastFailureOn: r.last_failure_on,
      lastFailureCode: r.last_failure_code,
      inFlight: r.in_flight,
      balance: Number(r.balance),
      currency: r.currency.trim(),
    }));
  }

  /**
   * Due invoices the scan cannot charge because the customer has no usable saved card, with the
   * reason (no card at all, or the active card has expired), so the history can say so.
   */
  async listUncollectable(today, { after = null, limit = 500 } = {}) {
    const [year, month] = today.split('-').map(Number);
    const rows = await this.manager.query(
      `SELECT i.id, i.tenant_id, i.booking_id, i.customer_id, i.amount - i.paid_amount AS balance, b.currency,
              CASE WHEN pm.id IS NULL THEN 'no_card' ELSE 'card_expired' END AS reason
         FROM billing.installment i
         JOIN billing.booking_ref b ON b.booking_id = i.booking_id AND b.status = 'active'
         LEFT JOIN billing.payment_method pm
           ON pm.tenant_id = i.tenant_id AND pm.customer_id = i.customer_id AND pm.is_active AND pm.status = 'active'
        WHERE i.status IN ('scheduled', 'due', 'overdue') AND i.due_date <= $1::date AND i.paid_amount < i.amount
          AND (pm.id IS NULL OR NOT (pm.exp_year > $2 OR (pm.exp_year = $2 AND pm.exp_month >= $3)))
          AND ($4::uuid IS NULL OR i.id > $4::uuid)
        ORDER BY i.id LIMIT $5`,
      [today, year, month, after, limit],
    );
    return rows.map((r) => ({
      invoiceId: r.id,
      tenantId: r.tenant_id,
      bookingId: r.booking_id,
      customerId: r.customer_id,
      balance: Number(r.balance),
      currency: r.currency.trim(),
      reason: r.reason,
    }));
  }
}

/** The scan's record of every invoice it looked at, and the day-by-day history built from it. */
const SHOWN_STATUS = `CASE WHEN a.decision = 'skip' THEN 'skipped'
       WHEN t.id IS NULL THEN 'queued'
       WHEN t.status = 'pending' THEN 'in_progress'
       ELSE t.status END`;
const TX_JOIN = `LEFT JOIN billing.payment_transaction t
       ON t.tenant_id = a.tenant_id AND t.idempotency_key = 'charge:' || a.invoice_id || ':' || a.attempt_key`;

export class CollectionAttemptRepository {
  constructor(manager) {
    this.manager = manager;
  }

  /** Records the scan's decisions; one that was already recorded today is left alone. */
  async record(rows) {
    for (const r of rows) {
      await this.manager.query(
        `INSERT INTO billing.collection_attempt
           (id, tenant_id, run_date, invoice_id, booking_id, customer_id, attempt_key, attempt_no, decision, reason, amount, currency)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (tenant_id, invoice_id, attempt_key) DO NOTHING`,
        [
          r.id,
          r.tenantId,
          r.runDate,
          r.invoiceId,
          r.bookingId,
          r.customerId,
          r.attemptKey,
          r.attemptNo,
          r.decision,
          r.reason,
          r.amount,
          r.currency,
        ],
      );
    }
  }

  /** Newest days first: when the scan ran and how its invoices ended up. `before` pages by date. */
  async listDays(tenantId, { before = null, limit = 31 } = {}) {
    const rows = await this.manager.query(
      `WITH shown AS (
         SELECT a.run_date, ${SHOWN_STATUS} AS st, a.amount, a.currency
           FROM billing.collection_attempt a ${TX_JOIN}
          WHERE a.tenant_id = $1
       ), per_day AS (
         SELECT run_date,
                count(*)::int AS total,
                count(*) FILTER (WHERE st = 'succeeded')::int AS succeeded,
                count(*) FILTER (WHERE st = 'failed')::int AS failed,
                count(*) FILTER (WHERE st = 'refunded')::int AS refunded,
                count(*) FILTER (WHERE st = 'skipped')::int AS skipped,
                count(*) FILTER (WHERE st IN ('queued', 'in_progress'))::int AS waiting,
                COALESCE(sum(amount) FILTER (WHERE st = 'succeeded'), 0)::bigint AS collected,
                COALESCE(sum(amount) FILTER (WHERE st = 'failed'), 0)::bigint AS failed_amount,
                max(currency) AS currency
           FROM shown GROUP BY run_date
       )
       SELECT to_char(COALESCE(p.run_date, j.run_date), 'YYYY-MM-DD') AS run_date,
              j.started_at, j.finished_at, j.error,
              COALESCE(p.total, 0) AS total, COALESCE(p.succeeded, 0) AS succeeded,
              COALESCE(p.failed, 0) AS failed, COALESCE(p.refunded, 0) AS refunded,
              COALESCE(p.skipped, 0) AS skipped, COALESCE(p.waiting, 0) AS waiting,
              COALESCE(p.collected, 0) AS collected, COALESCE(p.failed_amount, 0) AS failed_amount, p.currency
         FROM per_day p FULL JOIN (SELECT * FROM billing.job_run WHERE job = 'collect') j ON j.run_date = p.run_date
        WHERE ($2::date IS NULL OR COALESCE(p.run_date, j.run_date) < $2::date)
          AND (p.run_date IS NOT NULL OR j.run_date IS NOT NULL)
        ORDER BY COALESCE(p.run_date, j.run_date) DESC LIMIT $3`,
      [tenantId, before, limit],
    );
    return rows.map((r) => ({
      runDate: r.run_date,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      error: r.error,
      total: r.total,
      succeeded: r.succeeded,
      failed: r.failed,
      refunded: r.refunded,
      skipped: r.skipped,
      waiting: r.waiting,
      collected: Number(r.collected),
      failedAmount: Number(r.failed_amount),
      currency: r.currency?.trim() ?? null,
    }));
  }

  /** One day's invoices with their outcome. Keyset-paged by attempt id; `status` filters. */
  async listForDay(tenantId, runDate, { status = null, after = null, limit = 100 } = {}) {
    const rows = await this.manager.query(
      `SELECT * FROM (
         SELECT a.id, a.invoice_id, a.booking_id, a.customer_id, a.attempt_no, a.decision, a.reason,
                a.amount, a.currency, a.created_at, ${SHOWN_STATUS} AS shown_status,
                i.invoice_no, i.due_date::text AS due_date,
                b.unit_no, b.project_name, b.customer_name,
                t.id AS transaction_id, t.status AS tx_status, t.failure_code, t.failure_message,
                t.card_brand, t.card_last4, t.stripe_payment_intent_id, t.completed_at
           FROM billing.collection_attempt a
           JOIN billing.installment i ON i.id = a.invoice_id
           JOIN billing.booking_ref b ON b.booking_id = a.booking_id
           ${TX_JOIN}
          WHERE a.tenant_id = $1 AND a.run_date = $2::date AND ($4::uuid IS NULL OR a.id > $4::uuid)
       ) x
       WHERE ($3::text IS NULL OR x.shown_status = $3)
       ORDER BY x.id LIMIT $5`,
      [tenantId, runDate, status, after, limit],
    );
    return rows.map((r) => ({
      id: r.id,
      invoiceId: r.invoice_id,
      invoiceNo: r.invoice_no,
      dueDate: r.due_date,
      bookingId: r.booking_id,
      customerId: r.customer_id,
      customerName: r.customer_name,
      unitNo: r.unit_no,
      projectName: r.project_name,
      attemptNo: r.attempt_no,
      decision: r.decision,
      reason: r.reason,
      amount: Number(r.amount),
      currency: r.currency.trim(),
      transactionId: r.transaction_id,
      transactionStatus: r.tx_status,
      failureCode: r.failure_code,
      failureMessage: r.failure_message,
      cardBrand: r.card_brand,
      cardLast4: r.card_last4?.trim() ?? null,
      stripePaymentIntentId: r.stripe_payment_intent_id,
      finishedAt: r.completed_at,
      createdAt: r.created_at,
    }));
  }
}

/** One row per job per day: whoever inserts it first runs the job that day. */
export class JobRunRepository {
  constructor(manager) {
    this.manager = manager;
  }

  async claim(job, runDate) {
    const rows = await this.manager.query(
      'INSERT INTO billing.job_run (job, run_date) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING job',
      [job, runDate],
    );
    return rows.length > 0;
  }

  async finish(job, runDate, { result = null, error = null } = {}) {
    await this.manager.query(
      'UPDATE billing.job_run SET finished_at = now(), result = $3::jsonb, error = $4 WHERE job = $1 AND run_date = $2',
      [
        job,
        runDate,
        result ? JSON.stringify(result) : null,
        error ? String(error).slice(0, 500) : null,
      ],
    );
  }

  /** Lets a failed run be claimed again. */
  async release(job, runDate) {
    await this.manager.query('DELETE FROM billing.job_run WHERE job = $1 AND run_date = $2', [
      job,
      runDate,
    ]);
  }
}

/** Every customer email, once per event and template. */
export class EmailLogRepository {
  constructor(manager) {
    this.manager = manager;
  }

  /** The row for this event and template, creating it as pending on first sight. */
  async open({ id, tenantId, eventId, template, to, subject }) {
    await this.manager.query(
      `INSERT INTO billing.email_log (id, tenant_id, event_id, template, to_address, subject)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (event_id, template) DO NOTHING`,
      [id, tenantId, eventId, template, to, subject],
    );
    const rows = await this.manager.query(
      'SELECT id, status FROM billing.email_log WHERE event_id = $1 AND template = $2 FOR UPDATE',
      [eventId, template],
    );
    return rows[0];
  }

  async mark(id, status, { providerId = null, error = null } = {}) {
    await this.manager.query(
      `UPDATE billing.email_log SET status = $2, provider_id = $3, error = $4,
         sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END WHERE id = $1`,
      [id, status, providerId, error ? String(error).slice(0, 500) : null],
    );
  }
}
