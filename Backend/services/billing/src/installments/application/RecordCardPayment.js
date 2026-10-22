import {
  ConflictError,
  InvalidTransitionError,
  NotFoundError,
  PERMISSION,
  assertCan,
  today as todayOf,
} from '@estateops/kernel';
import { invoiceActions } from '../domain/actions.js';
import { bookPayment } from './bookPayment.js';

/**
 * After the provider confirmed the card, verify the intent with the provider and book the payment.
 * Repeating the call for the same intent returns the invoice without charging or booking twice.
 * input: { actor, id, providerId }
 */
export class RecordCardPayment {
  constructor({ uow, clock, gateway }) {
    Object.assign(this, { uow, clock, gateway });
  }

  async execute({ actor, id, providerId }) {
    assertCan(actor, PERMISSION.PAYMENTS_CARD);
    return this.uow.run(async (repos) => {
      const invoice = await repos.installments.findById(actor.tenantId, id, { lock: true });
      if (!invoice) throw new NotFoundError('Invoice not found');
      const intent = await repos.intents.findByProviderId(actor.tenantId, providerId);
      if (!intent) throw new NotFoundError('Payment not found');
      if (intent.installmentId !== invoice.id)
        throw new ConflictError('PAYMENT_MISMATCH', 'This payment belongs to another invoice');
      if (intent.recorded) return invoice;

      const remote = await this.gateway.retrieveIntent(providerId);
      if (remote.status !== 'succeeded')
        throw new ConflictError(
          'PAYMENT_NOT_COMPLETED',
          'The card provider has not confirmed this payment',
        );
      if (!invoiceActions(invoice, actor.permissions).includes('pay_by_card')) {
        throw new InvalidTransitionError(
          `Cannot take a card payment on a ${invoice.status} invoice`,
        );
      }
      const payable = Math.max(0, (intent.adjustedAmount ?? invoice.amount) - invoice.paidAmount);
      if (intent.amount > payable)
        throw new ConflictError(
          'BALANCE_CHANGED',
          'The invoice balance changed; refund this card payment',
        );

      const plan = {
        amount: intent.amount,
        reference: remote.chargeId,
        receivedOn: todayOf(this.clock),
        note: `Card •••• ${remote.last4}`,
        adjustment:
          intent.adjustedAmount && intent.adjustedAmount !== invoice.amount
            ? { amount: intent.adjustedAmount, reason: intent.adjustmentReason }
            : null,
      };
      const { invoice: saved } = await bookPayment({
        repos,
        actor,
        clock: this.clock,
        invoice,
        plan,
        method: 'card',
        source: 'stripe',
        stripeIntentId: providerId,
      });
      await repos.intents.markRecorded(intent.id, {
        chargeId: remote.chargeId,
        last4: remote.last4,
      });
      return saved;
    });
  }
}
