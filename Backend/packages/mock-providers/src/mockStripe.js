import { createHash, createHmac } from 'node:crypto';
import express from 'express';
import { token, unix } from './ids.js';

/**
 * A stand-in for the Stripe API: the same endpoints, request encoding (form data with bracket
 * keys), response objects and error shapes the real API uses, for the parts EstateOps calls:
 *
 *   customers, payment methods, embedded Checkout Sessions (payment and setup mode),
 *   off-session PaymentIntents, charges, refunds, and signed webhook events.
 *
 * Point the official `stripe` SDK at it (`host`, `port`, `protocol: 'http'`). Tests and the
 * `/_mock` routes play the customer: `complete` fills the embedded form with a card. Test cards:
 *   4242 4242 4242 4242 pays        5555 5555 5555 4444 pays (Mastercard)
 *   4000 0000 0000 0002 declined    4000 0000 0000 9995 insufficient funds
 *   4000 0000 0000 0069 expired     4000 0000 0000 0127 wrong CVC
 *   4000 0025 0000 3155 needs 3-D Secure (passes in Checkout, fails off-session)
 */
export const TEST_CARDS = Object.freeze({
  VISA: '4242424242424242',
  MASTERCARD: '5555555555554444',
  DECLINED: '4000000000000002',
  INSUFFICIENT_FUNDS: '4000000000009995',
  EXPIRED: '4000000000000069',
  WRONG_CVC: '4000000000000127',
  THREE_D_SECURE: '4000002500003155',
});

const DECLINES = {
  [TEST_CARDS.DECLINED]: {
    code: 'card_declined',
    decline_code: 'generic_decline',
    message: 'Your card was declined.',
  },
  [TEST_CARDS.INSUFFICIENT_FUNDS]: {
    code: 'card_declined',
    decline_code: 'insufficient_funds',
    message: 'Your card has insufficient funds.',
  },
  [TEST_CARDS.EXPIRED]: { code: 'expired_card', message: 'Your card has expired.' },
  [TEST_CARDS.WRONG_CVC]: {
    code: 'incorrect_cvc',
    message: "Your card's security code is incorrect.",
  },
};
const API_VERSION = '2025-02-24.acacia';
const SESSION_LIFETIME_S = 24 * 60 * 60;
const BRANDS = { 4: 'visa', 5: 'mastercard', 3: 'amex', 6: 'discover' };

function luhn(digits) {
  let sum = 0;
  [...digits].reverse().forEach((d, i) => {
    let n = Number(d);
    if (i % 2 === 1) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
    sum += n;
  });
  return sum % 10 === 0;
}

class StripeError extends Error {
  constructor(status, body) {
    super(body.message);
    this.status = status;
    this.body = body;
  }
}
const invalid = (message, param) =>
  new StripeError(400, { type: 'invalid_request_error', message, ...(param && { param }) });
const missing = (what, id) =>
  new StripeError(404, {
    type: 'invalid_request_error',
    code: 'resource_missing',
    message: `No such ${what}: '${id}'`,
    param: what === 'checkout.session' ? 'session' : what.replace('payment_', 'payment_'),
  });

/** Form-decoded values are strings: read integers and booleans the way Stripe does. */
const int = (v) => (v === undefined ? undefined : Number(v));
const flag = (v) => v === true || v === 'true';

export function createMockStripe({
  secretKey = 'sk_test_mock',
  webhookSecret = 'whsec_mock',
  webhookUrl = null,
  fetchImpl = fetch,
  now = () => Date.now(),
} = {}) {
  const state = {
    customers: new Map(),
    paymentMethods: new Map(),
    forcedDeclines: new Map(),
    sessions: new Map(),
    paymentIntents: new Map(),
    setupIntents: new Map(),
    charges: new Map(),
    refunds: new Map(),
    events: [],
    requests: [],
    deliveries: [],
    cards: new Map(), // payment method id -> the card number it was made from
    config: { webhookUrl, webhookSecret },
  };

  // ---- webhooks ---------------------------------------------------------------------------
  const sign = (payload, secret, ts) =>
    `t=${ts},v1=${createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex')}`;

  async function deliver(event) {
    if (!state.config.webhookUrl) return;
    const payload = JSON.stringify(event);
    const ts = unix(now());
    try {
      const res = await fetchImpl(state.config.webhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'user-agent': 'Stripe/1.0 (+https://stripe.com/docs/webhooks)',
          'stripe-signature': sign(payload, state.config.webhookSecret, ts),
        },
        body: payload,
      });
      state.deliveries.push({ eventId: event.id, status: res.status });
    } catch (error) {
      state.deliveries.push({ eventId: event.id, status: 0, error: error.message });
    }
  }

  async function emit(type, object, { requestId = null } = {}) {
    const event = {
      id: `evt_${token(24)}`,
      object: 'event',
      api_version: API_VERSION,
      created: unix(now()),
      data: { object },
      livemode: false,
      pending_webhooks: state.config.webhookUrl ? 1 : 0,
      request: { id: requestId, idempotency_key: null },
      type,
    };
    state.events.push(event);
    await deliver(event);
    return event;
  }

  // ---- object builders (shapes follow the Stripe API reference) ---------------------------
  const customerObject = (c) => ({
    id: c.id,
    object: 'customer',
    address: null,
    balance: 0,
    created: c.created,
    currency: null,
    default_source: null,
    delinquent: false,
    description: c.description ?? null,
    discount: null,
    email: c.email ?? null,
    invoice_prefix: c.id.slice(4, 12).toUpperCase(),
    invoice_settings: {
      custom_fields: null,
      default_payment_method: c.default_payment_method ?? null,
      footer: null,
      rendering_options: null,
    },
    livemode: false,
    metadata: c.metadata ?? {},
    name: c.name ?? null,
    next_invoice_sequence: 1,
    phone: null,
    preferred_locales: [],
    shipping: null,
    tax_exempt: 'none',
    test_clock: null,
  });

  const paymentMethodObject = (pm) => ({
    id: pm.id,
    object: 'payment_method',
    allow_redisplay: 'unspecified',
    billing_details: {
      address: {
        city: null,
        country: null,
        line1: null,
        line2: null,
        postal_code: null,
        state: null,
      },
      email: pm.email ?? null,
      name: pm.name ?? null,
      phone: null,
    },
    card: {
      brand: pm.brand,
      checks: { address_line1_check: null, address_postal_code_check: null, cvc_check: 'pass' },
      country: 'US',
      display_brand: pm.brand,
      exp_month: pm.exp_month,
      exp_year: pm.exp_year,
      fingerprint: pm.fingerprint,
      funding: 'credit',
      generated_from: null,
      last4: pm.last4,
      networks: { available: [pm.brand], preferred: null },
      three_d_secure_usage: { supported: true },
      wallet: null,
    },
    created: pm.created,
    customer: pm.customer,
    livemode: false,
    metadata: {},
    type: 'card',
  });

  const chargeObject = (ch) => ({
    id: ch.id,
    object: 'charge',
    amount: ch.amount,
    amount_captured: ch.paid ? ch.amount : 0,
    amount_refunded: ch.amount_refunded,
    application: null,
    balance_transaction: ch.paid ? `txn_${token(24)}` : null,
    billing_details: { address: {}, email: null, name: null, phone: null },
    captured: ch.paid,
    created: ch.created,
    currency: ch.currency,
    customer: ch.customer,
    description: null,
    disputed: false,
    failure_code: ch.failure_code ?? null,
    failure_message: ch.failure_message ?? null,
    livemode: false,
    metadata: ch.metadata ?? {},
    outcome: {
      network_status: ch.paid ? 'approved_by_network' : 'declined_by_network',
      type: ch.paid ? 'authorized' : 'issuer_declined',
    },
    paid: ch.paid,
    payment_intent: ch.payment_intent,
    payment_method: ch.payment_method,
    payment_method_details: {
      card: {
        brand: ch.brand,
        checks: { cvc_check: 'pass' },
        country: 'US',
        exp_month: ch.exp_month,
        exp_year: ch.exp_year,
        funding: 'credit',
        last4: ch.last4,
        network: ch.brand,
        three_d_secure: null,
      },
      type: 'card',
    },
    receipt_url: `https://pay.stripe.com/receipts/payment/${token(40)}`,
    refunded: ch.amount_refunded >= ch.amount && ch.amount > 0,
    status: ch.paid ? 'succeeded' : 'failed',
  });

  const paymentIntentObject = (pi, { expandCharge = false } = {}) => ({
    id: pi.id,
    object: 'payment_intent',
    amount: pi.amount,
    amount_capturable: 0,
    amount_received: pi.status === 'succeeded' ? pi.amount : 0,
    automatic_payment_methods: null,
    canceled_at: null,
    cancellation_reason: null,
    capture_method: 'automatic',
    client_secret: pi.client_secret,
    confirmation_method: 'automatic',
    created: pi.created,
    currency: pi.currency,
    customer: pi.customer,
    description: pi.description ?? null,
    last_payment_error: pi.last_payment_error ?? null,
    latest_charge:
      expandCharge && pi.latest_charge
        ? chargeObject(state.charges.get(pi.latest_charge))
        : pi.latest_charge,
    livemode: false,
    metadata: pi.metadata ?? {},
    payment_method: pi.payment_method,
    payment_method_types: ['card'],
    setup_future_usage: null,
    status: pi.status,
  });

  const setupIntentObject = (si) => ({
    id: si.id,
    object: 'setup_intent',
    application: null,
    cancellation_reason: null,
    client_secret: si.client_secret,
    created: si.created,
    customer: si.customer,
    description: null,
    livemode: false,
    metadata: si.metadata ?? {},
    payment_method: si.payment_method,
    payment_method_types: ['card'],
    status: si.status,
    usage: 'off_session',
  });

  function sessionObject(s) {
    const subtotal = s.mode === 'payment' ? s.amount : null;
    return {
      id: s.id,
      object: 'checkout.session',
      adaptive_pricing: { enabled: false },
      after_expiration: null,
      allow_promotion_codes: null,
      amount_subtotal: subtotal,
      amount_total: subtotal,
      automatic_tax: { enabled: false, liability: null, status: null },
      billing_address_collection: null,
      cancel_url: null,
      client_reference_id: s.client_reference_id ?? null,
      client_secret: s.status === 'open' ? s.client_secret : null,
      collected_information: null,
      consent: null,
      consent_collection: null,
      created: s.created,
      currency: s.mode === 'payment' ? s.currency : null,
      currency_conversion: null,
      custom_fields: [],
      custom_text: {
        after_submit: null,
        shipping_address: null,
        submit: null,
        terms_of_service_acceptance: null,
      },
      customer: s.customer ?? null,
      customer_creation: null,
      customer_details:
        s.status === 'complete'
          ? {
              address: null,
              email: s.customer_email ?? null,
              name: s.customer_name ?? null,
              phone: null,
              tax_exempt: 'none',
              tax_ids: [],
            }
          : null,
      customer_email: null,
      discounts: [],
      expires_at: s.expires_at,
      invoice: null,
      invoice_creation: null,
      livemode: false,
      locale: null,
      metadata: s.metadata ?? {},
      mode: s.mode,
      payment_intent: s.payment_intent ?? null,
      payment_link: null,
      payment_method_collection: 'if_required',
      payment_method_configuration_details: null,
      payment_method_options: { card: { request_three_d_secure: 'automatic' } },
      payment_method_types: ['card'],
      payment_status: s.payment_status,
      phone_number_collection: { enabled: false },
      recovered_from: null,
      redirect_on_completion: 'always',
      return_url: s.return_url,
      saved_payment_method_options: null,
      setup_intent: s.setup_intent ?? null,
      shipping_address_collection: null,
      shipping_cost: null,
      shipping_details: null,
      shipping_options: [],
      status: s.status,
      submit_type: null,
      subscription: null,
      success_url: null,
      total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 },
      ui_mode: 'embedded',
      url: null,
    };
  }

  // ---- card handling ---------------------------------------------------------------------
  function readCard(card) {
    const number = String(card?.number ?? '').replace(/\s/g, '');
    if (!/^\d{16}$/.test(number) || !luhn(number)) {
      return {
        error: {
          type: 'card_error',
          code: 'incorrect_number',
          message: 'Your card number is incorrect.',
          param: 'number',
        },
      };
    }
    const month = Number(card.exp_month);
    const year = Number(card.exp_year) < 100 ? 2000 + Number(card.exp_year) : Number(card.exp_year);
    const d = new Date(now());
    if (!(month >= 1 && month <= 12) || !Number.isInteger(year)) {
      return {
        error: {
          type: 'card_error',
          code: 'invalid_expiry_month',
          message: "Your card's expiration month is invalid.",
          param: 'exp_month',
        },
      };
    }
    if (year < d.getUTCFullYear() || (year === d.getUTCFullYear() && month < d.getUTCMonth() + 1)) {
      return {
        error: {
          type: 'card_error',
          code: 'expired_card',
          message: 'Your card has expired.',
          param: 'exp_year',
        },
      };
    }
    if (!/^\d{3,4}$/.test(String(card.cvc ?? ''))) {
      return {
        error: {
          type: 'card_error',
          code: 'incorrect_cvc',
          message: "Your card's security code is incorrect.",
          param: 'cvc',
        },
      };
    }
    const decline = DECLINES[number];
    if (decline) return { error: { type: 'card_error', param: '', ...decline }, number };
    return { number, month, year };
  }

  function makePaymentMethod({ number, month, year, customer, email, name }) {
    const pm = {
      id: `pm_${token(24)}`,
      created: unix(now()),
      brand: BRANDS[number[0]] ?? 'visa',
      last4: number.slice(-4),
      exp_month: month,
      exp_year: year,
      // Stripe's fingerprint is stable for the same card number within an account
      fingerprint: createHash('sha256').update(`fp:${number}`).digest('base64url').slice(0, 16),
      customer: customer ?? null,
      email,
      name,
    };
    state.paymentMethods.set(pm.id, pm);
    state.cards.set(pm.id, number);
    return pm;
  }

  async function makeSucceededPayment({ amount, currency, customer, pm, metadata, description }) {
    const pi = {
      id: `pi_${token(24)}`,
      created: unix(now()),
      amount,
      currency,
      customer: customer ?? null,
      payment_method: pm.id,
      status: 'succeeded',
      metadata: metadata ?? {},
      description,
      client_secret: null,
      latest_charge: null,
      last_payment_error: null,
    };
    pi.client_secret = `${pi.id}_secret_${token(24)}`;
    const charge = {
      id: `ch_${token(24)}`,
      created: unix(now()),
      amount,
      currency,
      customer: customer ?? null,
      payment_intent: pi.id,
      payment_method: pm.id,
      paid: true,
      amount_refunded: 0,
      brand: pm.brand,
      last4: pm.last4,
      exp_month: pm.exp_month,
      exp_year: pm.exp_year,
      metadata: metadata ?? {},
    };
    pi.latest_charge = charge.id;
    state.charges.set(charge.id, charge);
    state.paymentIntents.set(pi.id, pi);
    return pi;
  }

  /** The customer submits the embedded form (or an off-session charge is attempted). */
  async function failPayment({ amount, currency, customer, pm, metadata, error }) {
    const pi = {
      id: `pi_${token(24)}`,
      created: unix(now()),
      amount,
      currency,
      customer: customer ?? null,
      payment_method: null,
      status: 'requires_payment_method',
      metadata: metadata ?? {},
      client_secret: null,
      latest_charge: null,
      last_payment_error: { ...error, payment_method: paymentMethodObject(pm) },
    };
    pi.client_secret = `${pi.id}_secret_${token(24)}`;
    state.paymentIntents.set(pi.id, pi);
    await emit('payment_intent.payment_failed', paymentIntentObject(pi));
    return pi;
  }

  // ---- the HTTP API ----------------------------------------------------------------------
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'extended');
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(express.json());

  // the mock's own control plane needs no key
  app.use('/v1', (req, res, next) => {
    const auth = req.get('authorization') ?? '';
    state.requests.push({
      method: req.method,
      path: req.path,
      body: req.body,
      query: req.query,
      idempotencyKey: req.get('idempotency-key') ?? null,
    });
    if (auth !== `Bearer ${secretKey}`) {
      return res.status(401).json({
        error: {
          message: `Invalid API Key provided: ${auth.replace(/^Bearer /, '').slice(0, 8)}${'*'.repeat(8)}`,
          type: 'invalid_request_error',
        },
      });
    }
    return next();
  });

  const wrap = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (error) {
      if (!(error instanceof StripeError)) throw error;
      res.status(error.status).json({ error: error.body });
    }
  };

  const need = (map, id, what) => {
    const found = map.get(id);
    if (!found) throw missing(what, id);
    return found;
  };

  // customers
  app.post(
    '/v1/customers',
    wrap(async (req) => {
      const c = {
        id: `cus_${token(14)}`,
        created: unix(now()),
        email: req.body.email,
        name: req.body.name,
        description: req.body.description,
        metadata: req.body.metadata ?? {},
      };
      state.customers.set(c.id, c);
      await emit('customer.created', customerObject(c));
      return customerObject(c);
    }),
  );
  app.get(
    '/v1/customers/:id',
    wrap(async (req) => customerObject(need(state.customers, req.params.id, 'customer'))),
  );
  app.post(
    '/v1/customers/:id',
    wrap(async (req) => {
      const c = need(state.customers, req.params.id, 'customer');
      const def = req.body.invoice_settings?.default_payment_method;
      if (def !== undefined) {
        const pm = need(state.paymentMethods, def, 'payment_method');
        if (pm.customer !== c.id)
          throw invalid(
            `The customer does not have a payment method with the ID ${def}. The payment method must be attached to the customer.`,
            'invoice_settings[default_payment_method]',
          );
        c.default_payment_method = def;
      }
      for (const key of ['email', 'name', 'description'])
        if (req.body[key] !== undefined) c[key] = req.body[key];
      if (req.body.metadata) c.metadata = { ...c.metadata, ...req.body.metadata };
      return customerObject(c);
    }),
  );
  app.get(
    '/v1/customers/:id/payment_methods',
    wrap(async (req) => {
      need(state.customers, req.params.id, 'customer');
      const data = [...state.paymentMethods.values()]
        .filter((p) => p.customer === req.params.id)
        .map(paymentMethodObject);
      return {
        object: 'list',
        data,
        has_more: false,
        url: `/v1/customers/${req.params.id}/payment_methods`,
      };
    }),
  );
  app.get(
    '/v1/payment_methods/:id',
    wrap(async (req) =>
      paymentMethodObject(need(state.paymentMethods, req.params.id, 'payment_method')),
    ),
  );
  app.post(
    '/v1/payment_methods/:id/detach',
    wrap(async (req) => {
      const pm = need(state.paymentMethods, req.params.id, 'payment_method');
      if (!pm.customer) throw invalid('This PaymentMethod is not attached to a customer.');
      const customer = state.customers.get(pm.customer);
      if (customer?.default_payment_method === pm.id) customer.default_payment_method = null;
      pm.customer = null;
      await emit('payment_method.detached', paymentMethodObject(pm));
      return paymentMethodObject(pm);
    }),
  );

  // checkout sessions
  app.post(
    '/v1/checkout/sessions',
    wrap(async (req) => {
      const b = req.body;
      const mode = b.mode;
      if (!['payment', 'setup', 'subscription'].includes(mode))
        throw invalid('Invalid mode: must be one of payment, setup, or subscription', 'mode');
      if (b.ui_mode !== 'embedded')
        throw invalid('This mock supports only ui_mode=embedded', 'ui_mode');
      if (!b.return_url)
        throw invalid('return_url is required when ui_mode is embedded.', 'return_url');
      if (b.customer && !state.customers.has(b.customer)) throw missing('customer', b.customer);
      let amount = null;
      let currency = null;
      if (mode === 'payment') {
        const line = b.line_items?.[0];
        const price = line?.price_data;
        if (!price) throw invalid('Missing required param: line_items.', 'line_items');
        amount = int(price.unit_amount) * int(line.quantity ?? 1);
        currency = String(price.currency ?? '').toLowerCase();
        if (!Number.isInteger(amount) || amount < 50)
          throw invalid('Invalid integer: unit_amount', 'line_items[0][price_data][unit_amount]');
        if (!/^[a-z]{3}$/.test(currency))
          throw invalid('Invalid currency', 'line_items[0][price_data][currency]');
      } else if (b.line_items) {
        throw invalid('line_items is not allowed in setup mode.', 'line_items');
      }
      const id = `cs_test_${token(58)}`;
      const s = {
        id,
        client_secret: `${id}_secret_${token(32)}`,
        created: unix(now()),
        expires_at: int(b.expires_at) ?? unix(now()) + SESSION_LIFETIME_S,
        mode,
        status: 'open',
        payment_status: mode === 'payment' ? 'unpaid' : 'no_payment_required',
        customer: b.customer ?? null,
        return_url: b.return_url,
        metadata: b.metadata ?? {},
        client_reference_id: b.client_reference_id,
        amount,
        currency,
        payment_intent_metadata: b.payment_intent_data?.metadata ?? {},
        description: b.payment_intent_data?.description,
        setup_future_usage: b.payment_intent_data?.setup_future_usage ?? null,
      };
      state.sessions.set(id, s);
      return sessionObject(s);
    }),
  );
  app.get(
    '/v1/checkout/sessions/:id',
    wrap(async (req) => {
      const s = need(state.sessions, req.params.id, 'checkout.session');
      const out = sessionObject(s);
      const expand = [req.query.expand].flat().filter(Boolean);
      // expanding `a.b` expands `a` as well, as Stripe does
      const wants = (name) => expand.some((e) => e === name || e.startsWith(`${name}.`));
      if (wants('payment_intent') && s.payment_intent)
        out.payment_intent = paymentIntentObject(state.paymentIntents.get(s.payment_intent), {
          expandCharge: expand.includes('payment_intent.latest_charge'),
        });
      if (wants('setup_intent') && s.setup_intent) {
        const si = setupIntentObject(state.setupIntents.get(s.setup_intent));
        if (expand.includes('setup_intent.payment_method') && si.payment_method)
          si.payment_method = paymentMethodObject(state.paymentMethods.get(si.payment_method));
        out.setup_intent = si;
      }
      return out;
    }),
  );
  app.post(
    '/v1/checkout/sessions/:id/expire',
    wrap(async (req) => {
      const s = need(state.sessions, req.params.id, 'checkout.session');
      if (s.status !== 'open')
        throw invalid(
          `Only Checkout Sessions with a status in open can be expired. This Checkout Session has a status of ${s.status}.`,
        );
      s.status = 'expired';
      await emit('checkout.session.expired', sessionObject(s));
      return sessionObject(s);
    }),
  );

  // payment intents (off-session charges with a saved card) and lookups
  app.post(
    '/v1/payment_intents',
    wrap(async (req) => {
      const b = req.body;
      const amount = int(b.amount);
      if (!Number.isInteger(amount) || amount < 50)
        throw invalid('Invalid integer: amount', 'amount');
      const currency = String(b.currency ?? '').toLowerCase();
      const pm = need(state.paymentMethods, b.payment_method, 'payment_method');
      if (b.customer && pm.customer !== b.customer) {
        throw invalid(
          `The provided PaymentMethod was previously used with a Customer or attached to a different customer.`,
          'payment_method',
        );
      }
      const number = state.cards.get(pm.id);
      // a test can make this card fail from now on (as when the bank's balance runs out)
      const declined = state.forcedDeclines.get(pm.id) ?? DECLINES[number];
      const needs3ds = number === TEST_CARDS.THREE_D_SECURE && flag(b.off_session);
      if (declined || needs3ds) {
        const error = needs3ds
          ? {
              type: 'card_error',
              code: 'authentication_required',
              decline_code: 'authentication_required',
              message: 'Your card was declined. This transaction requires authentication.',
            }
          : {
              type: 'card_error',
              code: declined.code,
              decline_code: declined.decline_code,
              message: declined.message,
            };
        const pi = await failPayment({
          amount,
          currency,
          customer: b.customer,
          pm,
          metadata: b.metadata,
          error,
        });
        throw new StripeError(402, {
          ...error,
          payment_intent: paymentIntentObject(pi),
          payment_method: paymentMethodObject(pm),
        });
      }
      const pi = await makeSucceededPayment({
        amount,
        currency,
        customer: b.customer,
        pm,
        metadata: b.metadata,
        description: b.description,
      });
      await emit('payment_intent.succeeded', paymentIntentObject(pi));
      return paymentIntentObject(pi);
    }),
  );
  app.get(
    '/v1/payment_intents/:id',
    wrap(async (req) =>
      paymentIntentObject(need(state.paymentIntents, req.params.id, 'payment_intent'), {
        expandCharge: [req.query.expand].flat().includes('latest_charge'),
      }),
    ),
  );
  app.get(
    '/v1/charges/:id',
    wrap(async (req) => chargeObject(need(state.charges, req.params.id, 'charge'))),
  );

  // refunds
  app.post(
    '/v1/refunds',
    wrap(async (req) => {
      const pi = need(state.paymentIntents, req.body.payment_intent, 'payment_intent');
      const charge = need(state.charges, pi.latest_charge, 'charge');
      const amount =
        req.body.amount === undefined
          ? charge.amount - charge.amount_refunded
          : int(req.body.amount);
      if (amount > charge.amount - charge.amount_refunded) {
        throw invalid(
          `Refund amount (${amount}) is greater than unrefunded amount on charge (${charge.amount - charge.amount_refunded}).`,
          'amount',
        );
      }
      charge.amount_refunded += amount;
      const refund = {
        id: `re_${token(24)}`,
        object: 'refund',
        amount,
        balance_transaction: `txn_${token(24)}`,
        charge: charge.id,
        created: unix(now()),
        currency: charge.currency,
        metadata: req.body.metadata ?? {},
        payment_intent: pi.id,
        reason: req.body.reason ?? null,
        receipt_number: null,
        status: 'succeeded',
      };
      state.refunds.set(refund.id, refund);
      await emit('charge.refunded', chargeObject(charge));
      return refund;
    }),
  );

  // ---- the mock's control plane: the customer's side and test helpers --------------------
  const control = express.Router();
  control.use(express.json());

  /** The customer fills the embedded form. Body: { card: { number, exp_month, exp_year, cvc }, email?, name? } */
  control.post('/checkout-sessions/:id/complete', async (req, res) => {
    const s = state.sessions.get(req.params.id);
    if (!s) return res.status(404).json({ error: missing('checkout.session', req.params.id).body });
    if (s.status !== 'open')
      return res.status(400).json({
        error: {
          type: 'invalid_request_error',
          message: `This Checkout Session is ${s.status}.`,
        },
      });
    const read = readCard(req.body.card);
    if (read.error && !read.number)
      return res.status(402).json({ outcome: 'rejected', error: read.error });
    const email = req.body.email ?? state.customers.get(s.customer)?.email ?? null;
    const name = req.body.name ?? state.customers.get(s.customer)?.name ?? null;
    const pm = makePaymentMethod({
      number: read.number,
      month: Number(req.body.card.exp_month),
      year:
        Number(req.body.card.exp_year) < 100
          ? 2000 + Number(req.body.card.exp_year)
          : Number(req.body.card.exp_year),
      customer: null,
      email,
      name,
    });

    if (read.error) {
      await failPayment({
        amount: s.amount ?? 0,
        currency: s.currency ?? 'usd',
        customer: s.customer,
        pm,
        metadata: s.payment_intent_metadata,
        error: read.error,
      });
      return res.status(402).json({ outcome: 'declined', error: read.error });
    }
    Object.assign(s, { customer_email: email, customer_name: name });
    if (s.mode === 'payment') {
      // like Stripe: a card used with setup_future_usage is attached to the customer for later charges
      if (s.setup_future_usage && s.customer) pm.customer = s.customer;
      const pi = await makeSucceededPayment({
        amount: s.amount,
        currency: s.currency,
        customer: s.customer,
        pm,
        metadata: { ...s.payment_intent_metadata },
        description: s.description,
      });
      Object.assign(s, { status: 'complete', payment_status: 'paid', payment_intent: pi.id });
      await emit('payment_intent.succeeded', paymentIntentObject(pi));
    } else {
      pm.customer = s.customer;
      const si = {
        id: `seti_${token(24)}`,
        created: unix(now()),
        customer: s.customer,
        payment_method: pm.id,
        status: 'succeeded',
        client_secret: null,
        metadata: s.metadata,
      };
      si.client_secret = `${si.id}_secret_${token(24)}`;
      state.setupIntents.set(si.id, si);
      Object.assign(s, { status: 'complete', setup_intent: si.id });
      await emit('setup_intent.succeeded', setupIntentObject(si));
    }
    await emit('checkout.session.completed', sessionObject(s));
    return res.json({ outcome: 'succeeded', session: sessionObject(s) });
  });

  control.post('/checkout-sessions/:id/expire-now', async (req, res) => {
    const s = state.sessions.get(req.params.id);
    if (!s) return res.status(404).json({ error: missing('checkout.session', req.params.id).body });
    s.status = 'expired';
    await emit('checkout.session.expired', sessionObject(s));
    return res.json(sessionObject(s));
  });
  control.post('/events/:id/replay', async (req, res) => {
    const event = state.events.find((e) => e.id === req.params.id);
    if (!event) return res.status(404).json({ error: missing('event', req.params.id).body });
    await deliver(event);
    return res.json({ replayed: event.id });
  });
  control.get('/events', (_req, res) => res.json(state.events));
  control.get('/requests', (_req, res) => res.json(state.requests));
  control.get('/deliveries', (_req, res) => res.json(state.deliveries));
  /** Make charges to a saved card fail with a bank reason: { code, decline_code, message }, or {} to clear. */
  control.post('/payment-methods/:id/decline', (req, res) => {
    if (!state.paymentMethods.has(req.params.id))
      return res.status(404).json({ error: missing('payment_method', req.params.id).body });
    if (req.body?.decline_code || req.body?.code) {
      state.forcedDeclines.set(req.params.id, {
        code: req.body.code ?? 'card_declined',
        decline_code: req.body.decline_code,
        message: req.body.message ?? 'Your card was declined.',
      });
    } else state.forcedDeclines.delete(req.params.id);
    return res.json({ ok: true });
  });
  control.get('/payment-methods', (_req, res) =>
    res.json(
      [...state.paymentMethods.values()].map((pm) => ({
        id: pm.id,
        customer: pm.customer,
        brand: pm.card?.brand ?? pm.brand,
        last4: pm.card?.last4 ?? pm.last4,
      })),
    ),
  );
  control.post('/config', (req, res) => {
    Object.assign(state.config, req.body);
    res.json(state.config);
  });
  control.post('/reset', (_req, res) => {
    for (const key of [
      'customers',
      'paymentMethods',
      'forcedDeclines',
      'sessions',
      'paymentIntents',
      'setupIntents',
      'charges',
      'refunds',
      'cards',
    ])
      state[key].clear();
    state.events.length = 0;
    state.requests.length = 0;
    state.deliveries.length = 0;
    res.json({ ok: true });
  });
  app.use('/_mock', control);

  app.use((req, res) =>
    res.status(404).json({
      error: {
        type: 'invalid_request_error',
        message: `Unrecognized request URL (${req.method}: ${req.path}).`,
      },
    }),
  );
  app.use((error, _req, res, _next) =>
    res.status(500).json({ error: { type: 'api_error', message: error.message } }),
  );

  return {
    app,
    state,
    sign: (payload, ts = unix(now())) => sign(payload, state.config.webhookSecret, ts),
    emit,
  };
}
