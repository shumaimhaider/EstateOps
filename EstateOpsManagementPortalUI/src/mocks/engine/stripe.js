import { nowIso } from './clock.js';
import { today } from './dates.js';
import { MockApiError } from './errors.js';
import { findInstallment, getInstallmentDto } from './installments.js';
import { applyPayment, invoiceActions, planPayment } from './payments.js';
import { requirePermission } from './permissions.js';
import { balanceOf } from './register.js';

/**
 * Stand-in for Stripe. Our back end creates a PaymentIntent and later verifies it; the card
 * itself is confirmed directly with Stripe (never through our API), which is what
 * `confirmPaymentIntent` plays. Test cards: 4242 4242 4242 4242 succeeds, 4000 0000 0000 0002
 * is declined, 4000 0000 0000 9995 has insufficient funds.
 */
const DECLINES = {
  4000000000000002: { code: 'card_declined', decline_code: 'generic_decline' },
  4000000000009995: { code: 'card_declined', decline_code: 'insufficient_funds' },
  4000000000000069: { code: 'expired_card' },
  4000000000000127: { code: 'incorrect_cvc' },
};
const MESSAGES = {
  incorrect_number: 'Your card number is incorrect.',
  invalid_expiry: 'Your card has an invalid expiry date.',
  expired_card: 'Your card has expired.',
  incorrect_cvc: "Your card's security code is incorrect.",
  generic_decline: 'Your card was declined.',
  insufficient_funds: 'Your card has insufficient funds.',
};

function luhn(digits) {
  let sum = 0;
  [...digits].reverse().forEach((d, i) => {
    let n = Number(d);
    if (i % 2 === 1) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
    sum += n;
  });
  return sum % 10 === 0;
}

function intentFor(db, ctx, id) {
  const intent = db.stripeIntents[id];
  if (!intent || intent.tenant_id !== ctx.tenant.id) {
    throw new MockApiError(404, 'NOT_FOUND', 'Payment not found');
  }
  return intent;
}

/** Our API: start a card payment for an invoice (optionally for a part amount or adjusted invoice). */
export function createPaymentIntent(db, ctx, installmentId, body) {
  requirePermission(ctx, 'payments.card');
  const row = findInstallment(db, ctx, installmentId);
  if (!invoiceActions(row, ctx.user).includes('pay_by_card')) {
    throw new MockApiError(
      409,
      'INVALID_TRANSITION',
      `Cannot take a card payment on a ${row.status} invoice`,
    );
  }
  const plan = planPayment(db, ctx, row, body);
  const booking = db.bookings.find((b) => b.id === row.booking_id);
  const id = `pi_mock_${String(Object.keys(db.stripeIntents).length + 1).padStart(6, '0')}`;
  const intent = {
    id,
    client_secret: `${id}_secret_${globalThis.crypto.randomUUID().slice(0, 8)}`,
    tenant_id: ctx.tenant.id,
    installment_id: row.id,
    amount: plan.amount,
    currency: booking.currency.toLowerCase(),
    adjustment: plan.adjustment,
    status: 'requires_payment_method',
    charge: null,
    recorded: false,
    created_at: nowIso(db.clock),
  };
  db.stripeIntents[id] = intent;
  return {
    payment_intent_id: intent.id,
    client_secret: intent.client_secret,
    amount: intent.amount,
    currency: booking.currency,
    status: intent.status,
  };
}

function cardProblem(db, card) {
  const digits = String(card?.number ?? '').replace(/\s/g, '');
  if (!/^\d{16}$/.test(digits) || !luhn(digits)) return { code: 'incorrect_number' };
  const [mm, yy] = String(card?.expiry ?? '')
    .split('/')
    .map((p) => Number(p?.trim()));
  if (!(mm >= 1 && mm <= 12) || !Number.isInteger(yy)) return { code: 'invalid_expiry' };
  const [year, month] = today(db).split('-').map(Number);
  if (2000 + yy < year || (2000 + yy === year && mm < month)) return { code: 'expired_card' };
  if (!/^\d{3,4}$/.test(String(card?.cvc ?? ''))) return { code: 'incorrect_cvc' };
  return DECLINES[digits] ?? null;
}

/** "Stripe": confirm the PaymentIntent with a card. Returns { status, body } like Stripe's HTTP API. */
export function confirmPaymentIntent(db, { intentId, clientSecret, card }) {
  const intent = db.stripeIntents[intentId];
  if (!intent || intent.client_secret !== clientSecret) {
    return {
      status: 404,
      body: {
        error: {
          type: 'invalid_request_error',
          code: 'resource_missing',
          message: 'No such payment_intent',
        },
      },
    };
  }
  if (intent.status !== 'succeeded') {
    const problem = cardProblem(db, card);
    if (problem) {
      const key = problem.decline_code ?? problem.code;
      return {
        status: 402,
        body: {
          error: {
            type: 'card_error',
            ...problem,
            message: MESSAGES[key] ?? MESSAGES.generic_decline,
            payment_intent: { id: intent.id, status: intent.status },
          },
        },
      };
    }
    const digits = String(card.number).replace(/\s/g, '');
    intent.status = 'succeeded';
    intent.charge = {
      id: `ch_mock_${String(Object.keys(db.stripeIntents).length).padStart(6, '0')}${intent.id.slice(-3)}`,
      last4: digits.slice(-4),
      brand: digits.startsWith('4') ? 'visa' : 'mastercard',
    };
  }
  return {
    status: 200,
    body: {
      id: intent.id,
      status: intent.status,
      amount: intent.amount,
      currency: intent.currency,
      charge: intent.charge,
    },
  };
}

/**
 * Our API: after Stripe reports success, verify the intent server-side and book the payment.
 * Replaying the same intent returns the invoice without paying twice.
 */
export function recordStripePayment(db, ctx, installmentId, body) {
  requirePermission(ctx, 'payments.card');
  const row = findInstallment(db, ctx, installmentId);
  const intent = intentFor(db, ctx, body.payment_intent_id);
  if (intent.installment_id !== row.id) {
    throw new MockApiError(409, 'PAYMENT_MISMATCH', 'This payment belongs to another invoice');
  }
  if (intent.recorded) return getInstallmentDto(db, ctx, row);
  if (intent.status !== 'succeeded') {
    throw new MockApiError(409, 'PAYMENT_NOT_COMPLETED', 'Stripe has not confirmed this payment');
  }
  const balance = balanceOf({
    amount: intent.adjustment?.amount ?? row.amount,
    paid_amount: row.paid_amount,
  });
  if (intent.amount > balance) {
    throw new MockApiError(
      409,
      'BALANCE_CHANGED',
      'The invoice balance changed; refund this card payment',
    );
  }
  const plan = {
    amount: intent.amount,
    reference: intent.charge.id,
    receivedOn: today(db),
    note: `Card •••• ${intent.charge.last4}`,
    adjustment: intent.adjustment,
  };
  applyPayment(db, ctx, row, plan, { method: 'card', source: 'stripe', stripeIntentId: intent.id });
  intent.recorded = true;
  return getInstallmentDto(db, ctx, row);
}
