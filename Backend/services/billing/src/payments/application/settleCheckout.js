import { today as todayOf } from '@estateops/kernel';
import { invoiceActions } from '../../installments/domain/actions.js';
import { bookPayment } from '../../installments/application/bookPayment.js';
import * as tx from '../domain/transaction.js';
import { chargeRefunded, chargeSucceeded } from './announce.js';
import { savePaymentMethod } from './savePaymentMethod.js';

const SYSTEM = { userId: null, name: 'Stripe' };
const actorOf = (checkout) => ({
  userId: checkout.createdBy,
  name: checkout.createdByName ?? 'Stripe',
  permissions: [],
});

/**
 * Brings a checkout up to date with what Stripe says about its session. Called from the webhook
 * and from the return page, so it must be safe to run any number of times in any order: it works
 * on the locked checkout and invoice and only ever moves things forward.
 *
 * `session` is the gateway's view of the Checkout Session (see stripeGatewayPort).
 */
export async function settleCheckout({ repos, gateway, clock, checkoutId, session }) {
  const checkout = await repos.checkouts.findByIdAny(checkoutId, { lock: true });
  if (!checkout || checkout.status !== 'open') return { checkout, outcome: 'unchanged' };
  if (session.status === 'open') return { checkout, outcome: 'open' };

  if (session.status === 'expired') {
    await repos.checkouts.setStatus(checkout.id, 'expired');
    const pending = await repos.transactions.findByCheckout(checkout.id);
    if (pending?.status === 'pending') {
      await repos.transactions.save(tx.cancel(pending, session.raw, clock.now()));
    }
    return { checkout: { ...checkout, status: 'expired' }, outcome: 'expired' };
  }

  if (checkout.purpose === 'save_card') return settleCardSave({ repos, checkout, session });
  return settlePayment({ repos, gateway, clock, checkout, session });
}

async function settleCardSave({ repos, checkout, session }) {
  const pm = session.setup?.paymentMethod;
  if (!pm) return { checkout, outcome: 'open' }; // setup not finished yet
  const actor = actorOf(checkout);
  const { method } = await savePaymentMethod({
    repos,
    tenantId: checkout.tenantId,
    customerId: checkout.customerId,
    stripePm: pm,
    via: checkout.createdVia,
    actor,
  });
  await repos.checkouts.setStatus(checkout.id, 'complete');
  return { checkout: { ...checkout, status: 'complete' }, outcome: 'card_saved', method };
}

async function settlePayment({ repos, gateway, clock, checkout, session }) {
  const payment = session.payment;
  const transaction = await repos.transactions.findByCheckout(checkout.id);
  if (!payment || payment.status !== 'succeeded' || !transaction) {
    return { checkout, outcome: 'open' }; // still processing (or nothing to book)
  }
  if (transaction.status !== 'pending') return { checkout, outcome: 'unchanged', transaction };

  const now = clock.now();
  const invoice = await repos.installments.findById(checkout.tenantId, checkout.installmentId, {
    lock: true,
  });
  const payable = invoice
    ? Math.max(0, (checkout.adjustedAmount ?? invoice.amount) - invoice.paidAmount)
    : 0;
  const canPay = invoice && invoiceActions(invoice, ['payments.card']).includes('pay_by_card');
  const evidence = { checkout_session: session.raw };

  if (!canPay || checkout.amount > payable) {
    // The card was charged but the invoice moved on (paid by hand, waived, adjusted). Return the money.
    const refunded = await gateway.refund(
      { paymentIntentId: payment.intentId, reason: 'requested_by_customer' },
      { idempotencyKey: `refund:${transaction.id}` },
    );
    const refundedTx = tx.refund(
      transaction,
      {
        refundId: refunded.id,
        reason: 'BALANCE_CHANGED',
        intentId: payment.intentId,
        chargeId: payment.chargeId,
        card: payment.card,
        response: { ...evidence, refund: refunded.raw },
      },
      now,
    );
    await repos.transactions.save(refundedTx);
    await repos.outbox.add(chargeRefunded(refundedTx, now));
    await repos.checkouts.setStatus(checkout.id, 'complete');
    await repos.audit.record({
      tenantId: checkout.tenantId,
      actor: SYSTEM,
      action: 'payment.auto_refund',
      subjectType: 'installment',
      subjectId: checkout.installmentId,
      after: { amount: checkout.amount, reason: 'BALANCE_CHANGED', refund: refunded.id },
    });
    return { checkout: { ...checkout, status: 'complete' }, outcome: 'refunded' };
  }

  const plan = {
    amount: checkout.amount,
    reference: payment.chargeId,
    receivedOn: todayOf(clock),
    note: `Card •••• ${payment.card?.last4 ?? ''}`.trim(),
    adjustment:
      checkout.adjustedAmount && checkout.adjustedAmount !== invoice.amount
        ? { amount: checkout.adjustedAmount, reason: checkout.adjustmentReason }
        : null,
  };
  const { payment: booked, invoice: saved } = await bookPayment({
    repos,
    actor: actorOf(checkout),
    clock,
    invoice,
    plan,
    method: 'card',
    source: 'stripe',
    stripeIntentId: payment.intentId,
  });
  const done = tx.succeed(
    transaction,
    {
      intentId: payment.intentId,
      chargeId: payment.chargeId,
      card: payment.card,
      response: evidence,
      paymentId: booked.id,
    },
    now,
  );
  await repos.transactions.save(done);
  await repos.outbox.add(chargeSucceeded(done, now));
  await repos.checkouts.setStatus(checkout.id, 'complete');

  if (checkout.saveCard && payment.paymentMethodId) {
    const pm = await gateway.retrievePaymentMethod(payment.paymentMethodId);
    await savePaymentMethod({
      repos,
      tenantId: checkout.tenantId,
      customerId: checkout.customerId,
      stripePm: pm,
      via: checkout.createdVia,
      actor: actorOf(checkout),
    });
  }
  return {
    checkout: { ...checkout, status: 'complete' },
    outcome: 'paid',
    transaction: done,
    invoice: saved,
  };
}
