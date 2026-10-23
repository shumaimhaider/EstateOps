import {
  ConflictError,
  InvalidTransitionError,
  NotFoundError,
  PERMISSION,
  assertCan,
  can,
  today as todayOf,
} from '@estateops/kernel';
import { invoiceActions } from '../../installments/domain/actions.js';
import { bookPayment } from '../../installments/application/bookPayment.js';
import { planPayment } from '../../installments/domain/payment.js';
import { nextRetry } from '../domain/collectionPolicy.js';
import { assertChargeable } from '../domain/paymentMethod.js';
import * as tx from '../domain/transaction.js';
import { chargeFailed, chargeRefunded, chargeSucceeded } from './announce.js';

const SYSTEM = { userId: null, name: 'System', permissions: ['payments.card'] };

/**
 * Charges an invoice to the customer's active saved card. This one use case is the common code
 * behind every saved-card payment: staff in the management portal, the customer portal and the
 * payment worker that works through the daily collection queue.
 *
 * Two short database steps around the Stripe call, never holding a lock while talking to Stripe:
 *   1. record a pending transaction under an idempotency key (a repeat finds it and stops here)
 *   2. call Stripe, then book the payment (or record the failure) against the re-read invoice
 * If the process dies between the two, the pending row is reconciled later with the same key.
 * Every outcome is announced as an event, which is what sends the customer's email.
 *
 * input: { actor?, tenantId?, id, input?: { amount?, adjustedAmount?, adjustmentReason? },
 *          trigger, attemptKey }
 */
export class ChargeSavedCard {
  constructor({ uow, clock, gateway }) {
    Object.assign(this, { uow, clock, gateway });
  }

  async execute({
    actor = null,
    id,
    tenantId = actor?.tenantId,
    input = {},
    trigger = 'staff_saved_card',
    attemptKey,
  }) {
    const by = actor ?? SYSTEM;
    if (actor && !actor.customerId && trigger === 'staff_saved_card')
      assertCan(actor, PERMISSION.PAYMENTS_CARD);
    const key = `charge:${id}:${attemptKey}`;
    const today = todayOf(this.clock);

    const started = await this.uow.run(async (repos) => {
      const repeat = await repos.transactions.findByIdempotencyKey(tenantId, key);
      if (repeat) return { repeat };
      const invoice = await repos.installments.findById(tenantId, id);
      if (!invoice) throw new NotFoundError('Invoice not found');
      if (!invoiceActions(invoice, ['payments.card']).includes('pay_by_card')) {
        throw new InvalidTransitionError(
          `Cannot take a card payment on a ${invoice.status} invoice`,
        );
      }
      const plan = planPayment(invoice, input, {
        today,
        canAdjust: actor ? can(actor, PERMISSION.INVOICES_ADJUST) : false,
        referenceTaken: false,
      });
      const booking = await repos.bookingRefs.findById(tenantId, invoice.bookingId);
      // a customer can only charge their own invoices; anything else looks like it does not exist
      if (actor?.customerId && booking.customerId !== actor.customerId)
        throw new NotFoundError('Invoice not found');
      const base = {
        tenantId,
        invoice,
        customerId: booking.customerId,
        amount: plan.amount,
        currency: booking.currency,
        trigger,
        idempotencyKey: key,
        actor: by,
        now: this.clock.now(),
      };

      const method = await repos.paymentMethods.findActive(tenantId, booking.customerId);
      const stripeCustomerId = await repos.stripeCustomers.find(tenantId, booking.customerId);
      try {
        assertChargeable(method, today);
        if (!stripeCustomerId)
          throw new ConflictError('NO_ACTIVE_CARD', 'This customer has no saved card to charge');
      } catch (error) {
        // staff are told; the background collector records the refusal so the history shows why
        if (trigger !== 'scheduled' || !(error instanceof ConflictError)) throw error;
        const refused = tx.fail(
          tx.startTransaction({ ...base, paymentMethodId: method?.id ?? null }),
          { code: error.code, message: error.message },
          this.clock.now(),
        );
        await repos.transactions.insert(refused);
        await repos.transactions.save(refused);
        await this.#announceFailure(repos, refused, today);
        return { refused };
      }

      const pending = tx.startTransaction({ ...base, paymentMethodId: method.id });
      await repos.transactions.insert(pending);
      return { pending, method, stripeCustomerId, invoice, booking, plan };
    });
    if (started.repeat) return { transaction: started.repeat, repeated: true };
    if (started.refused) return { transaction: started.refused, failed: true };

    const { pending, method, stripeCustomerId, invoice, booking, plan } = started;
    const result = await this.gateway.chargeSavedCard(
      {
        customerId: stripeCustomerId,
        paymentMethodId: method.stripePaymentMethodId,
        amount: plan.amount,
        currency: booking.currency,
        description: `${invoice.invoiceNo} · ${booking.unitNo}`,
        metadata: {
          tenant_id: tenantId,
          invoice_id: invoice.id,
          booking_id: invoice.bookingId,
          customer_id: booking.customerId,
          transaction_id: pending.id,
        },
      },
      { idempotencyKey: key },
    );
    return this.#finish({ tenantId, pending, result, plan, by, invoiceId: invoice.id, today });
  }

  async #announceFailure(repos, failed, today) {
    const retry =
      failed.trigger === 'scheduled'
        ? nextRetry(
            await repos.transactions.countFailedScheduled(failed.tenantId, failed.installmentId),
            failed.failureCode,
            today,
          )
        : { willRetry: false, retryOn: null };
    await repos.outbox.add(chargeFailed(failed, retry, this.clock.now()));
  }

  async #finish({ tenantId, pending, result, plan, by, invoiceId, today }) {
    const now = this.clock.now();
    return this.uow.run(async (repos) => {
      if (!result.ok) {
        const failed = tx.fail(
          pending,
          {
            code: result.error.declineCode ?? result.error.code,
            message: result.error.message,
            intentId: result.intentId,
            response: result.raw,
          },
          now,
        );
        await repos.transactions.save(failed);
        await repos.audit.record({
          tenantId,
          actor: by,
          action: 'payment.card_failed',
          subjectType: 'installment',
          subjectId: invoiceId,
          after: { code: failed.failureCode, amount: pending.amount },
        });
        await this.#announceFailure(repos, failed, today);
        return { transaction: failed, failed: true };
      }

      const invoice = await repos.installments.findById(tenantId, invoiceId, { lock: true });
      const payment = result.payment;
      const payable = Math.max(0, (plan.adjustment?.amount ?? invoice.amount) - invoice.paidAmount);
      if (
        !invoiceActions(invoice, ['payments.card']).includes('pay_by_card') ||
        plan.amount > payable
      ) {
        const refunded = await this.gateway.refund(
          { paymentIntentId: payment.intentId, reason: 'requested_by_customer' },
          { idempotencyKey: `refund:${pending.id}` },
        );
        const done = tx.refund(
          pending,
          {
            refundId: refunded.id,
            reason: 'BALANCE_CHANGED',
            intentId: payment.intentId,
            chargeId: payment.chargeId,
            card: payment.card,
            response: { payment_intent: result.raw, refund: refunded.raw },
          },
          now,
        );
        await repos.transactions.save(done);
        await repos.outbox.add(chargeRefunded(done, now));
        await repos.audit.record({
          tenantId,
          actor: by,
          action: 'payment.auto_refund',
          subjectType: 'installment',
          subjectId: invoiceId,
          after: { amount: plan.amount, reason: 'BALANCE_CHANGED', refund: refunded.id },
        });
        return { transaction: done, refunded: true };
      }

      const { payment: booked, invoice: saved } = await bookPayment({
        repos,
        actor: by,
        clock: this.clock,
        invoice,
        plan: {
          amount: plan.amount,
          reference: payment.chargeId,
          receivedOn: today,
          note: `Card •••• ${payment.card?.last4 ?? ''}`.trim(),
          adjustment: plan.adjustment,
        },
        method: 'card',
        source: 'stripe',
        stripeIntentId: payment.intentId,
      });
      const done = tx.succeed(
        pending,
        {
          intentId: payment.intentId,
          chargeId: payment.chargeId,
          card: payment.card,
          response: result.raw,
          paymentId: booked.id,
        },
        now,
      );
      await repos.transactions.save(done);
      await repos.outbox.add(chargeSucceeded(done, now));
      return { transaction: done, invoice: saved };
    });
  }
}
