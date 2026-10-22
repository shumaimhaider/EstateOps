import { randomUUID } from 'node:crypto';
import { toDateString } from '@estateops/kernel';

/**
 * A stand-in for the card provider (Stripe), behind the same port the real adapter will have:
 * createIntent, retrieveIntent, and (here only) confirm, which stands for the browser confirming the
 * card with the provider. Test cards: 4242 4242 4242 4242 pays, 4000 0000 0000 0002 is declined,
 * 4000 0000 0000 9995 has insufficient funds. State is in memory, so it is for development and tests.
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

export function createFakeCardGateway({ clock }) {
  const intents = new Map();

  function cardProblem(card) {
    const digits = String(card?.number ?? '').replace(/\s/g, '');
    if (!/^\d{16}$/.test(digits) || !luhn(digits)) return { code: 'incorrect_number' };
    const [mm, yy] = String(card?.expiry ?? '')
      .split('/')
      .map((p) => Number(p?.trim()));
    if (!(mm >= 1 && mm <= 12) || !Number.isInteger(yy)) return { code: 'invalid_expiry' };
    const [year, month] = toDateString(clock.now().getTime()).split('-').map(Number);
    if (2000 + yy < year || (2000 + yy === year && mm < month)) return { code: 'expired_card' };
    if (!/^\d{3,4}$/.test(String(card?.cvc ?? ''))) return { code: 'incorrect_cvc' };
    return DECLINES[digits] ?? null;
  }

  return {
    async createIntent({ amount, currency }) {
      const providerId = `pi_mock_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
      const clientSecret = `${providerId}_secret_${randomUUID().slice(0, 8)}`;
      intents.set(providerId, {
        providerId,
        clientSecret,
        amount,
        currency,
        status: 'requires_payment_method',
        chargeId: null,
        last4: null,
      });
      return { providerId, clientSecret };
    },

    async retrieveIntent(providerId) {
      const intent = intents.get(providerId);
      if (!intent) return { status: 'missing', chargeId: null, last4: null };
      return { status: intent.status, chargeId: intent.chargeId, last4: intent.last4 };
    },

    /** What the provider answers when the browser confirms a card: `{ ok, status, body }`. */
    async confirm({ providerId, clientSecret, card }) {
      const intent = intents.get(providerId);
      if (!intent || intent.clientSecret !== clientSecret) {
        return {
          ok: false,
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
        const problem = cardProblem(card);
        if (problem) {
          const key = problem.decline_code ?? problem.code;
          return {
            ok: false,
            status: 402,
            body: {
              error: {
                type: 'card_error',
                ...problem,
                message: MESSAGES[key] ?? MESSAGES.generic_decline,
              },
            },
          };
        }
        const digits = String(card.number).replace(/\s/g, '');
        Object.assign(intent, {
          status: 'succeeded',
          chargeId: `ch_mock_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
          last4: digits.slice(-4),
        });
      }
      return {
        ok: true,
        status: 200,
        body: {
          id: intent.providerId,
          status: intent.status,
          amount: intent.amount,
          currency: intent.currency.toLowerCase(),
        },
      };
    },
  };
}
