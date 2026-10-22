import { ConflictError, NotFoundError } from '@estateops/kernel';
import { pgCode, pgConstraint, rowsOf } from '@estateops/platform';
import { PaymentRow } from './entities.js';

const toPayment = (r) => ({
  id: r.id,
  installmentId: r.installment_id,
  bookingId: r.booking_id,
  amount: r.amount,
  method: r.method,
  source: r.source,
  reference: r.reference,
  receivedOn: r.received_on,
  note: r.note,
  recordedByName: r.recorded_by_name,
  createdAt: r.created_at,
});

/** The payment ledger. A reference is unique per tenant and a card intent books once. */
export class PaymentRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
    this.repo = manager.getRepository(PaymentRow);
  }

  async insert(p) {
    try {
      await this.repo.insert({
        id: p.id,
        tenant_id: p.tenantId,
        installment_id: p.installmentId,
        booking_id: p.bookingId,
        amount: p.amount,
        method: p.method,
        source: p.source,
        reference: p.reference,
        received_on: p.receivedOn,
        note: p.note,
        stripe_intent_id: p.stripeIntentId,
        recorded_by: p.recordedBy,
        recorded_by_name: p.recordedByName,
      });
    } catch (error) {
      if (pgCode(error) === '23505') {
        const intent = pgConstraint(error) === 'payment_intent_uq';
        throw new ConflictError(
          intent ? 'PAYMENT_ALREADY_RECORDED' : 'REFERENCE_TAKEN',
          intent ? 'This card payment was already recorded' : 'Payment reference is already used',
        );
      }
      throw error;
    }
    return p;
  }

  async referenceTaken(tenantId, reference) {
    const rows = await this.manager.query(
      'SELECT 1 FROM billing.payment WHERE tenant_id = $1 AND reference = $2 LIMIT 1',
      [tenantId, reference],
    );
    return rows.length > 0;
  }

  async listForInvoice(tenantId, installmentId) {
    const rows = await this.manager.query(
      'SELECT * FROM billing.payment WHERE tenant_id = $1 AND installment_id = $2 ORDER BY created_at, id',
      [tenantId, installmentId],
    );
    return rows.map(toPayment);
  }
}

/** Card payments in flight, mirrored from the provider so a payment can be verified and recorded once. */
export class IntentRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  async insert(i) {
    await this.manager.query(
      `INSERT INTO billing.payment_intent (id, tenant_id, installment_id, provider_id, client_secret, amount, currency, adjusted_amount, adjustment_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        i.id,
        i.tenantId,
        i.installmentId,
        i.providerId,
        i.clientSecret,
        i.amount,
        i.currency,
        i.adjustedAmount,
        i.adjustmentReason,
      ],
    );
  }

  async findByProviderId(tenantId, providerId) {
    const rows = await this.manager.query(
      'SELECT * FROM billing.payment_intent WHERE tenant_id = $1 AND provider_id = $2',
      [tenantId, providerId],
    );
    const r = rows[0];
    return r
      ? {
          id: r.id,
          tenantId: r.tenant_id,
          installmentId: r.installment_id,
          providerId: r.provider_id,
          amount: r.amount,
          currency: r.currency.trim(),
          adjustedAmount: r.adjusted_amount,
          adjustmentReason: r.adjustment_reason,
          recorded: r.recorded,
        }
      : null;
  }

  async markRecorded(id, { chargeId, last4 }) {
    const rows = rowsOf(
      await this.manager.query(
        `UPDATE billing.payment_intent SET recorded = true, status = 'succeeded', charge_id = $2, card_last4 = $3, updated_at = now() WHERE id = $1 RETURNING id`,
        [id, chargeId, last4],
      ),
    );
    if (rows.length === 0) throw new NotFoundError('Payment not found');
  }
}
