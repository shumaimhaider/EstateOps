import * as tx from '../domain/transaction.js';
import { settleCheckout } from './settleCheckout.js';

const SETTLE_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.expired',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
]);

/**
 * A verified Stripe webhook. Each event id is processed once: the event row is written first (that
 * is the dedupe), then the matching checkout or transaction is brought up to date. Anything we do
 * not care about is stored and marked ignored, so the full Stripe history stays inspectable.
 * Returns { duplicate, outcome }.
 */
export class HandleStripeEvent {
  constructor({ uow, clock, gateway }) {
    Object.assign(this, { uow, clock, gateway });
  }

  async execute(event) {
    const fresh = await this.uow.run((repos) => repos.stripeEvents.receive(event));
    if (!fresh) return { duplicate: true };
    try {
      const outcome = await this.#dispatch(event);
      await this.uow.run((repos) =>
        repos.stripeEvents.finish(event.id, outcome === 'ignored' ? 'ignored' : 'processed'),
      );
      return { duplicate: false, outcome };
    } catch (error) {
      // leave the row failed so a replay (same id) is not mistaken for a duplicate: remove and rethrow
      await this.uow.run((repos) => repos.stripeEvents.forget(event.id));
      throw error;
    }
  }

  async #dispatch(event) {
    const object = event.data.object;
    if (SETTLE_EVENTS.has(event.type)) return this.#settleSession(object.id);
    if (event.type === 'payment_intent.payment_failed') return this.#paymentFailed(object);
    return 'ignored';
  }

  async #settleSession(stripeSessionId) {
    const known = await this.uow.read((repos) => repos.checkouts.findByStripeId(stripeSessionId));
    if (!known) return 'ignored'; // a session this system did not open
    const session = await this.gateway.retrieveSession(stripeSessionId);
    const result = await this.uow.run((repos) =>
      settleCheckout({
        repos,
        gateway: this.gateway,
        clock: this.clock,
        checkoutId: known.id,
        session,
      }),
    );
    return result.outcome;
  }

  async #paymentFailed(intent) {
    const error = intent.last_payment_error ?? {};
    return this.uow.run(async (repos) => {
      const checkoutId = intent.metadata?.checkout_id;
      let transaction = await repos.transactions.findByIntent(intent.id);
      if (!transaction && checkoutId)
        transaction = await repos.transactions.findByCheckout(checkoutId);
      if (!transaction) return 'ignored';
      if (transaction.status !== 'pending') return 'unchanged';
      const info = {
        code: error.decline_code ?? error.code,
        message: error.message,
        intentId: intent.id,
        response: intent,
      };
      // inside an open Checkout form the buyer may try another card; a background charge is over
      const retryable = Boolean(transaction.checkoutSessionId);
      await repos.transactions.save(
        retryable
          ? tx.noteAttemptError(transaction, info)
          : tx.fail(transaction, info, this.clock.now()),
      );
      await repos.audit.record({
        tenantId: transaction.tenantId,
        actor: { userId: null, name: 'Stripe' },
        action: 'payment.card_failed',
        subjectType: 'installment',
        subjectId: transaction.installmentId,
        after: { code: error.decline_code ?? error.code, amount: transaction.amount },
      });
      return retryable ? 'attempt_failed' : 'failed';
    });
  }
}
