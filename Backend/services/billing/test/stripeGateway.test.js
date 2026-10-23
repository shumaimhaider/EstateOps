import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createMockStripe, listen, TEST_CARDS } from '@estateops/mock-providers';
import { createStripeGateway } from '../src/payments/infrastructure/StripeGateway.js';
import {
  assertStripeGateway,
  ProviderError,
  WebhookSignatureError,
} from '../src/payments/application/stripeGatewayPort.js';

const card = (number) => ({
  number,
  exp_month: 12,
  exp_year: new Date().getFullYear() + 2,
  cvc: '123',
});

describe('Stripe gateway against the mock Stripe API', () => {
  let mock, srv, gw;
  const play = (path, body) =>
    fetch(`${srv.url}/_mock${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });

  beforeAll(async () => {
    mock = createMockStripe();
    srv = await listen(mock.app);
    gw = createStripeGateway({
      secretKey: 'sk_test_mock',
      webhookSecret: 'whsec_mock',
      apiBase: srv.url,
      maxNetworkRetries: 0,
    });
  });
  afterAll(() => srv.close());
  beforeEach(() => fetch(`${srv.url}/_mock/reset`, { method: 'POST' }));

  it('implements the whole port', () => {
    expect(assertStripeGateway(gw)).toBe(gw);
    expect(() => assertStripeGateway({})).toThrow(/missing/);
  });

  it('creates a customer and an embedded payment session and reads the payment back', async () => {
    const customer = await gw.createCustomer(
      { email: 'ali@example.test', name: 'Ali', metadata: { customer_id: 'c1' } },
      { idempotencyKey: 'k1' },
    );
    expect(customer.id).toMatch(/^cus_/);
    const session = await gw.createPaymentSession({
      customerId: customer.id,
      amount: 250000,
      currency: 'PKR',
      description: 'INV-1',
      returnUrl: 'http://app/return?session_id={CHECKOUT_SESSION_ID}',
      metadata: { invoice_id: 'i1', checkout_id: 'cx1' },
      saveCard: true,
    });
    expect(session.clientSecret).toMatch(/_secret_/);
    expect(session.raw).toMatchObject({
      object: 'checkout.session',
      ui_mode: 'embedded',
      amount_total: 250000,
      currency: 'pkr',
    });

    await play(`/checkout-sessions/${session.id}/complete`, { card: card(TEST_CARDS.VISA) });
    const got = await gw.retrieveSession(session.id);
    expect(got).toMatchObject({
      status: 'complete',
      paymentStatus: 'paid',
      mode: 'payment',
      customerId: customer.id,
    });
    expect(got.payment).toMatchObject({
      status: 'succeeded',
      amount: 250000,
      currency: 'pkr',
      metadata: { invoice_id: 'i1', checkout_id: 'cx1' },
      card: { brand: 'visa', last4: '4242' },
    });
    expect(got.payment.chargeId).toMatch(/^ch_/);
  });

  it('saves a card through a setup session and charges it off-session, then refunds', async () => {
    const { id: cus } = await gw.createCustomer({ email: 'a@b.c', name: 'A' });
    const setup = await gw.createSetupSession({
      customerId: cus,
      returnUrl: 'http://app/return',
      metadata: {},
    });
    await play(`/checkout-sessions/${setup.id}/complete`, { card: card(TEST_CARDS.MASTERCARD) });
    const done = await gw.retrieveSession(setup.id);
    expect(done.setup.paymentMethod).toMatchObject({ brand: 'mastercard', last4: '4444' });
    const pm = await gw.retrievePaymentMethod(done.setup.paymentMethod.id);
    expect(pm).toMatchObject({ customerId: cus, last4: '4444' });

    const ok = await gw.chargeSavedCard({
      customerId: cus,
      paymentMethodId: pm.id,
      amount: 9000,
      currency: 'AED',
      description: 'x',
      metadata: { invoice_id: 'i1' },
    });
    expect(ok).toMatchObject({ ok: true, payment: { status: 'succeeded', amount: 9000 } });
    const refund = await gw.refund({ paymentIntentId: ok.payment.intentId, amount: 3000 });
    expect(refund).toMatchObject({ status: 'succeeded', amount: 3000 });
    await gw.detachPaymentMethod(pm.id);
    expect((await gw.retrievePaymentMethod(pm.id)).customerId).toBeNull();
  });

  it('reports declines as results with the Stripe codes and keeps the raw error', async () => {
    const { id: cus } = await gw.createCustomer({ email: 'a@b.c', name: 'A' });
    const setup = await gw.createSetupSession({
      customerId: cus,
      returnUrl: 'http://app/return',
      metadata: {},
    });
    await play(`/checkout-sessions/${setup.id}/complete`, {
      card: card(TEST_CARDS.THREE_D_SECURE),
    });
    const pmId = (await gw.retrieveSession(setup.id)).setup.paymentMethod.id;
    const declined = await gw.chargeSavedCard({
      customerId: cus,
      paymentMethodId: pmId,
      amount: 5000,
      currency: 'usd',
      description: 'x',
      metadata: {},
    });
    expect(declined).toMatchObject({ ok: false, error: { code: 'authentication_required' } });
    expect(declined.raw).toBeTruthy();
  });

  it('turns other provider failures into ProviderError, and verifies webhook signatures', async () => {
    await expect(gw.retrieveSession('cs_missing')).rejects.toBeInstanceOf(ProviderError);
    await expect(gw.retrieveSession('cs_missing')).rejects.toMatchObject({
      code: 'resource_missing',
      status: 404,
    });
    const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'x' });
    expect(gw.verifyWebhook(payload, mock.sign(payload)).id).toBe('evt_1');
    expect(() => gw.verifyWebhook(payload, 't=1,v1=bad')).toThrow(WebhookSignatureError);
    const wrongKey = createStripeGateway({
      secretKey: 'sk_test_wrong',
      webhookSecret: 'whsec_mock',
      apiBase: srv.url,
      maxNetworkRetries: 0,
    });
    await expect(wrongKey.createCustomer({ email: 'a@b.c', name: 'A' })).rejects.toMatchObject({
      status: 401,
    });
  });
});
