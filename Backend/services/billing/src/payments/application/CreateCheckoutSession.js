import {
  InvalidTransitionError,
  NotFoundError,
  PERMISSION,
  assertCan,
  can,
  newId,
  today as todayOf,
} from '@estateops/kernel';
import { invoiceActions } from '../../installments/domain/actions.js';
import { planPayment } from '../../installments/domain/payment.js';
import { startTransaction } from '../domain/transaction.js';
import { ensureStripeCustomer } from './ensureStripeCustomer.js';

/**
 * Opens an embedded Stripe Checkout session to take a card payment on an invoice. The card is typed
 * into Stripe's own form in the browser; nothing about it reaches EstateOps. The payment is booked
 * later, once Stripe says the session is complete (webhook or return page), and only if the invoice
 * balance still allows it.
 * A customer in the portal uses the same use case: their actor carries `customerId`, so the invoice
 * must belong to them (anything else is "not found") and they cannot adjust amounts.
 * input: { actor, id, input: { amount?, adjustedAmount?, adjustmentReason?, saveCard? } }
 */
export class CreateCheckoutSession {
  constructor({ uow, clock, gateway, stripe }) {
    Object.assign(this, { uow, clock, gateway, stripe });
  }

  async execute({ actor, id, input = {} }) {
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
      if (actor.customerId && booking.customerId !== actor.customerId)
        throw new NotFoundError('Invoice not found');
      const own = Boolean(actor.customerId);
      const stripeCustomerId = await ensureStripeCustomer({
        repos,
        gateway: this.gateway,
        tenantId: actor.tenantId,
        customerId: booking.customerId,
      });

      const checkoutId = newId();
      const session = await this.gateway.createPaymentSession(
        {
          customerId: stripeCustomerId,
          amount: plan.amount,
          currency: booking.currency,
          description: `${invoice.invoiceNo} · ${booking.unitNo}`,
          returnUrl: this.stripe.returnUrl.replace('{CHECKOUT_ID}', checkoutId),
          saveCard: Boolean(input.saveCard),
          metadata: {
            tenant_id: actor.tenantId,
            invoice_id: invoice.id,
            booking_id: invoice.bookingId,
            customer_id: booking.customerId,
            checkout_id: checkoutId,
          },
        },
        { idempotencyKey: `chk:${checkoutId}` },
      );

      const checkout = {
        id: checkoutId,
        tenantId: actor.tenantId,
        purpose: 'payment',
        customerId: booking.customerId,
        installmentId: invoice.id,
        stripeSessionId: session.id,
        amount: plan.amount,
        currency: booking.currency,
        adjustedAmount: plan.adjustment?.amount ?? null,
        adjustmentReason: plan.adjustment?.reason ?? null,
        saveCard: Boolean(input.saveCard),
        status: 'open',
        createdBy: actor.userId,
        createdByName: actor.name,
        createdVia: own ? 'customer' : 'staff',
      };
      await repos.checkouts.insert(checkout);
      await repos.transactions.insert(
        startTransaction({
          tenantId: actor.tenantId,
          invoice,
          customerId: booking.customerId,
          amount: plan.amount,
          currency: booking.currency,
          trigger: own ? 'customer_checkout' : 'staff_checkout',
          checkoutSessionId: checkoutId,
          actor,
          now: this.clock.now(),
        }),
      );
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'payment.checkout_open',
        subjectType: 'installment',
        subjectId: invoice.id,
        after: { checkoutId, amount: plan.amount, adjusted: plan.adjustment?.amount ?? null },
      });
      return {
        checkoutId,
        clientSecret: session.clientSecret,
        publishableKey: this.stripe.publishableKey,
        amount: plan.amount,
        currency: booking.currency,
      };
    });
  }
}
