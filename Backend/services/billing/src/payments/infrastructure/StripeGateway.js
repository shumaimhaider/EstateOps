import Stripe from 'stripe';
import { ProviderError, WebhookSignatureError } from '../application/stripeGatewayPort.js';

/** Stripe objects carry SDK bookkeeping (`lastResponse`); what we store is the plain JSON. */
const plain = (object) => JSON.parse(JSON.stringify(object ?? null));

const cardOf = (pm) =>
  pm?.card && {
    brand: pm.card.brand,
    last4: pm.card.last4,
    expMonth: pm.card.exp_month,
    expYear: pm.card.exp_year,
    fingerprint: pm.card.fingerprint ?? null,
  };

function paymentOf(intent) {
  if (!intent || typeof intent === 'string') return null;
  const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
  const pm = charge?.payment_method_details?.card;
  return {
    intentId: intent.id,
    status: intent.status,
    amount: intent.amount,
    currency: intent.currency,
    chargeId:
      charge?.id ?? (typeof intent.latest_charge === 'string' ? intent.latest_charge : null),
    paymentMethodId:
      typeof intent.payment_method === 'string'
        ? intent.payment_method
        : (intent.payment_method?.id ?? charge?.payment_method ?? null),
    card: pm && { brand: pm.brand, last4: pm.last4, expMonth: pm.exp_month, expYear: pm.exp_year },
    metadata: intent.metadata ?? {},
  };
}

/**
 * The Stripe adapter (official SDK). `apiBase` points it at a mock server in tests; leave it out
 * for the real API. Card errors become results; everything else becomes a ProviderError.
 */
export function createStripeGateway({
  secretKey,
  webhookSecret,
  apiBase = null,
  maxNetworkRetries = 2,
}) {
  const options = { maxNetworkRetries, appInfo: { name: 'EstateOps' } };
  if (apiBase) {
    const url = new URL(apiBase);
    Object.assign(options, {
      host: url.hostname,
      port: url.port,
      protocol: url.protocol.replace(':', ''),
    });
  }
  const stripe = new Stripe(secretKey, options);
  const idem = (o) => (o?.idempotencyKey ? { idempotencyKey: o.idempotencyKey } : {});

  async function call(fn) {
    try {
      return await fn();
    } catch (error) {
      if (error?.type === 'StripeCardError') throw error;
      throw new ProviderError(error?.message ?? 'Card provider error', {
        code: error?.code ?? error?.type ?? 'PROVIDER_ERROR',
        status: error?.statusCode ?? null,
      });
    }
  }

  return {
    async createCustomer({ email, name, metadata }, o) {
      const c = await call(() =>
        stripe.customers.create({ email: email ?? undefined, name, metadata }, idem(o)),
      );
      return { id: c.id, raw: plain(c) };
    },

    async createPaymentSession(
      {
        customerId,
        amount,
        currency,
        description,
        metadata,
        returnUrl,
        saveCard = false,
        expiresAt,
      },
      o,
    ) {
      const s = await call(() =>
        stripe.checkout.sessions.create(
          {
            ui_mode: 'embedded',
            mode: 'payment',
            customer: customerId,
            return_url: returnUrl,
            client_reference_id: metadata?.checkout_id,
            ...(expiresAt && { expires_at: expiresAt }),
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: currency.toLowerCase(),
                  unit_amount: amount,
                  product_data: { name: description },
                },
              },
            ],
            metadata,
            payment_intent_data: {
              metadata,
              description,
              ...(saveCard && { setup_future_usage: 'off_session' }),
            },
          },
          idem(o),
        ),
      );
      return { id: s.id, clientSecret: s.client_secret, raw: plain(s) };
    },

    async createSetupSession({ customerId, returnUrl, metadata }, o) {
      const s = await call(() =>
        stripe.checkout.sessions.create(
          {
            ui_mode: 'embedded',
            mode: 'setup',
            customer: customerId,
            return_url: returnUrl,
            currency: undefined,
            metadata,
          },
          idem(o),
        ),
      );
      return { id: s.id, clientSecret: s.client_secret, raw: plain(s) };
    },

    async retrieveSession(id) {
      const s = await call(() =>
        stripe.checkout.sessions.retrieve(id, {
          expand: ['payment_intent.latest_charge', 'setup_intent.payment_method'],
        }),
      );
      const setupPm =
        s.setup_intent && typeof s.setup_intent === 'object' ? s.setup_intent.payment_method : null;
      return {
        id: s.id,
        status: s.status,
        mode: s.mode,
        paymentStatus: s.payment_status,
        customerId: typeof s.customer === 'string' ? s.customer : (s.customer?.id ?? null),
        metadata: s.metadata ?? {},
        payment: s.mode === 'payment' ? paymentOf(s.payment_intent) : null,
        setup:
          s.mode === 'setup' && setupPm && typeof setupPm === 'object'
            ? { paymentMethod: { id: setupPm.id, ...cardOf(setupPm) } }
            : null,
        raw: plain(s),
      };
    },

    async expireSession(id) {
      const s = await call(() => stripe.checkout.sessions.expire(id));
      return { id: s.id, status: s.status };
    },

    async chargeSavedCard(
      { customerId, paymentMethodId, amount, currency, description, metadata },
      o,
    ) {
      try {
        const pi = await stripe.paymentIntents.create(
          {
            amount,
            currency: currency.toLowerCase(),
            customer: customerId,
            payment_method: paymentMethodId,
            off_session: true,
            confirm: true,
            description,
            metadata,
          },
          idem(o),
        );
        const full = await stripe.paymentIntents.retrieve(pi.id, { expand: ['latest_charge'] });
        return { ok: true, payment: paymentOf(full), raw: plain(full) };
      } catch (error) {
        if (error?.type === 'StripeCardError') {
          const intent = error.payment_intent ?? error.raw?.payment_intent ?? null;
          return {
            ok: false,
            error: {
              code: error.code,
              declineCode: error.decline_code ?? null,
              message: error.message,
            },
            intentId: intent?.id ?? null,
            raw: plain(error.raw ?? { message: error.message, code: error.code }),
          };
        }
        throw new ProviderError(error?.message ?? 'Card provider error', {
          code: error?.code ?? error?.type ?? 'PROVIDER_ERROR',
          status: error?.statusCode ?? null,
        });
      }
    },

    async refund({ paymentIntentId, amount, reason }, o) {
      const r = await call(() =>
        stripe.refunds.create(
          { payment_intent: paymentIntentId, ...(amount && { amount }), ...(reason && { reason }) },
          idem(o),
        ),
      );
      return { id: r.id, status: r.status, amount: r.amount, raw: plain(r) };
    },

    async retrievePaymentMethod(id) {
      const pm = await call(() => stripe.paymentMethods.retrieve(id));
      return {
        id: pm.id,
        ...cardOf(pm),
        customerId: typeof pm.customer === 'string' ? pm.customer : null,
      };
    },

    async detachPaymentMethod(id) {
      await call(() => stripe.paymentMethods.detach(id));
    },

    verifyWebhook(rawBody, signatureHeader) {
      try {
        return stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
      } catch (error) {
        throw new WebhookSignatureError(error.message);
      }
    },
  };
}
