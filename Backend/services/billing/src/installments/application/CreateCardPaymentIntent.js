import {
  InvalidTransitionError,
  NotFoundError,
  PERMISSION,
  assertCan,
  can,
  newId,
  today as todayOf,
} from '@estateops/kernel';
import { invoiceActions } from '../domain/actions.js';
import { planPayment } from '../domain/payment.js';

/**
 * Starts a card payment: validates the amount (and an optional adjusted invoice amount, applied only
 * once the card succeeds) and asks the card provider for an intent. The card itself is confirmed
 * with the provider directly and never reaches this service.
 * input: { actor, id, input: { amount?, adjustedAmount?, adjustmentReason? } }
 */
export class CreateCardPaymentIntent {
  constructor({ uow, clock, gateway }) {
    Object.assign(this, { uow, clock, gateway });
  }

  async execute({ actor, id, input }) {
    assertCan(actor, PERMISSION.PAYMENTS_CARD);
    return this.uow.run(async (repos) => {
      const invoice = await repos.installments.findById(actor.tenantId, id);
      if (!invoice) throw new NotFoundError('Invoice not found');
      if (!invoiceActions(invoice, actor.permissions).includes('pay_by_card')) {
        throw new InvalidTransitionError(
          `Cannot take a card payment on a ${invoice.status} invoice`,
        );
      }
      const plan = planPayment(invoice, input, {
        today: todayOf(this.clock),
        canAdjust: can(actor, PERMISSION.INVOICES_ADJUST),
        referenceTaken: false,
      });
      const booking = await repos.bookingRefs.findById(actor.tenantId, invoice.bookingId);
      const remote = await this.gateway.createIntent({
        amount: plan.amount,
        currency: booking.currency,
        tenantId: actor.tenantId,
      });
      const intent = {
        id: newId(),
        tenantId: actor.tenantId,
        installmentId: invoice.id,
        providerId: remote.providerId,
        clientSecret: remote.clientSecret,
        amount: plan.amount,
        currency: booking.currency,
        adjustedAmount: plan.adjustment?.amount ?? null,
        adjustmentReason: plan.adjustment?.reason ?? null,
      };
      await repos.intents.insert(intent);
      return {
        providerId: intent.providerId,
        clientSecret: intent.clientSecret,
        amount: intent.amount,
        currency: intent.currency,
        status: 'requires_payment_method',
      };
    });
  }
}
