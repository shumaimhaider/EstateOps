import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { EVENT, buildEvent } from '@estateops/contracts';
import { TEST_TENANT_A } from '@estateops/platform/testing';
import { CreateSchedule } from '../src/installments/application/CreateSchedule.js';
import { RecordPayment } from '../src/installments/application/RecordPayment.js';
import { ChargeSavedCard } from '../src/payments/application/ChargeSavedCard.js';
import { CreateCardSetupSession } from '../src/payments/application/CreateCardSetupSession.js';
import { CreateCheckoutSession } from '../src/payments/application/CreateCheckoutSession.js';
import { GetCheckoutSession } from '../src/payments/application/GetCheckoutSession.js';
import { HandleStripeEvent } from '../src/payments/application/HandleStripeEvent.js';
import {
  ListPaymentMethods,
  RemovePaymentMethod,
  SetActivePaymentMethod,
} from '../src/payments/application/PaymentMethods.js';
import { GetTransaction, ListTransactions } from '../src/payments/application/Transactions.js';
import { CONFIRMED, actor, buildBillingTest, payInCheckout, uuid } from './fakes.js';

const BASE = '/api/v1/admin';
const CUSTOMER = uuid(301);
const VISA = '4242424242424242';
const MASTERCARD = '5555555555554444';
const DECLINED = '4000000000000002';
const NEEDS_3DS = '4000002500003155';

describe('Stripe card payments', () => {
  let t;
  let finance;

  const ev = (type, data) =>
    buildEvent({ type, tenantId: TEST_TENANT_A, producer: 'x', data, now: t.clock.now() });
  const invoices = () => [...t.stores.invoices.values()].sort((a, b) => a.seq - b.seq);
  const emi = () => invoices()[1];
  const stripeSession = (checkoutId) => t.stores.checkouts.get(checkoutId).stripeSessionId;
  const uc = (Klass) => new Klass(t.deps);
  const open = (input = { amount: 1_000_000 }, id = emi().id, a = finance) =>
    uc(CreateCheckoutSession).execute({ actor: a, id, input });
  const status = (checkoutId) => uc(GetCheckoutSession).execute({ actor: finance, id: checkoutId });
  const eventsOf = (type) => t.stripeMock.state.events.filter((e) => e.type === type);
  const hook = (event) => uc(HandleStripeEvent).execute(event);
  const payments = () => t.stores.payments.filter((p) => p.source === 'stripe');

  /** Saves a card for the customer through a setup session, as the embedded form would. */
  const saveCard = async (number = VISA, a = finance) => {
    const s = await uc(CreateCardSetupSession).execute({ actor: a, customerId: CUSTOMER });
    await payInCheckout(t, stripeSession(s.checkoutId), number);
    await status(s.checkoutId);
    return s;
  };

  beforeEach(async () => {
    t = await buildBillingTest();
    finance = actor('finance');
    t.stores.customerRefs.set(CUSTOMER, {
      customerId: CUSTOMER,
      tenantId: TEST_TENANT_A,
      fullName: 'Ali Raza',
      phone: null,
      email: 'ali@example.test',
    });
    await new CreateSchedule(t.deps).execute(
      ev(EVENT.BOOKING_CONFIRMED, CONFIRMED({ booked_at: '2026-05-01' })),
    );
  });

  describe('opening an embedded Checkout session', () => {
    it('creates the Stripe customer once, a pending transaction and the client secret for the form', async () => {
      const a = await open();
      expect(a).toMatchObject({
        amount: 1_000_000,
        currency: 'PKR',
        publishableKey: 'pk_test_mock',
      });
      expect(a.clientSecret).toMatch(/^cs_test_.*_secret_/);
      const session = t.stripeMock.state.sessions.get(stripeSession(a.checkoutId));
      expect(session).toMatchObject({ mode: 'payment', amount: 1_000_000, currency: 'pkr' });
      expect(session.return_url).toBe(`http://app.test/payments/return?checkout=${a.checkoutId}`);
      expect(session.metadata).toMatchObject({
        invoice_id: emi().id,
        checkout_id: a.checkoutId,
        customer_id: CUSTOMER,
      });
      const [tx] = [...t.stores.transactions.values()];
      expect(tx).toMatchObject({
        status: 'pending',
        trigger: 'staff_checkout',
        amount: 1_000_000,
        currency: 'PKR',
      });
      await open();
      expect(t.stripeMock.state.customers.size).toBe(1);
      expect(t.auditEntries.map((e) => e.action)).toContain('payment.checkout_open');
    });

    it('defaults to the whole balance and refuses amounts above it, unpayable invoices and unknown ones', async () => {
      const full = await open({});
      expect(full.amount).toBe(emi().amount);
      await expect(open({ amount: emi().amount + 1 })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
      await expect(open({}, uuid(9999))).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await uc(RecordPayment).execute({ actor: finance, id: emi().id, input: { method: 'cash' } });
      await expect(open({})).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    });

    it('needs the card permission, and an adjusted amount needs the adjust permission and a reason', async () => {
      await expect(open({}, emi().id, actor('sales_agent'))).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(
        open({ adjustedAmount: 900_000 }, emi().id, actor('sales_manager')),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(open({ adjustedAmount: 900_000 })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
      const ok = await open({
        adjustedAmount: 900_000,
        adjustmentReason: 'Early settlement',
        amount: 100_000,
      });
      expect(t.stores.checkouts.get(ok.checkoutId)).toMatchObject({
        adjustedAmount: 900_000,
        adjustmentReason: 'Early settlement',
      });
      expect(emi().amount).not.toBe(900_000); // applied only once the card succeeds
    });
  });

  describe('completing the payment', () => {
    it('books the payment when the buyer pays, from the return page, and keeps Stripe’s answer', async () => {
      const a = await open();
      expect((await status(a.checkoutId)).checkout.status).toBe('open');
      expect(payments()).toHaveLength(0);

      await payInCheckout(t, stripeSession(a.checkoutId), VISA);
      const done = await status(a.checkoutId);
      expect(done.checkout.status).toBe('complete');
      expect(done.transaction).toMatchObject({
        status: 'succeeded',
        cardBrand: 'visa',
        cardLast4: '4242',
      });
      expect(done.transaction.stripeResponse.checkout_session).toMatchObject({
        object: 'checkout.session',
        payment_status: 'paid',
      });
      expect(done.transaction.stripeResponse.checkout_session.payment_intent).toMatchObject({
        object: 'payment_intent',
        status: 'succeeded',
      });

      expect(payments()).toEqual([
        expect.objectContaining({
          amount: 1_000_000,
          method: 'card',
          stripeIntentId: done.transaction.stripePaymentIntentId,
          reference: done.transaction.stripeChargeId,
          note: 'Card •••• 4242',
        }),
      ]);
      expect(emi().paidAmount).toBe(1_000_000);
      expect(t.auditEntries.at(-1).action).toBe('installment.card_payment');
      expect(done.transaction.paymentId).toBe(payments()[0].id);
    });

    it('books it once however often the return page and the webhook both report it', async () => {
      const a = await open({});
      await payInCheckout(t, stripeSession(a.checkoutId), VISA);
      const completed = eventsOf('checkout.session.completed')[0];
      await Promise.all([status(a.checkoutId), hook(completed), status(a.checkoutId)]);
      const again = await hook(completed);
      expect(again.duplicate).toBe(true);
      await hook({ ...completed, id: 'evt_other' }); // a different event for the same, already settled, session
      expect(payments()).toHaveLength(1);
      expect(emi().status).toBe('paid');
      expect(emi().receiptNo).toMatch(/^RCT-PK-/);
      expect(t.events.filter((e) => e.type === 'payment.recorded')).toHaveLength(1);
    });

    it('applies an adjusted invoice amount only once the charge succeeded, and audits it', async () => {
      const a = await open({
        amount: 700_000,
        adjustedAmount: 700_000,
        adjustmentReason: 'Discount agreed',
      });
      const before = emi().amount;
      await payInCheckout(t, stripeSession(a.checkoutId), VISA);
      await status(a.checkoutId);
      expect(emi()).toMatchObject({
        amount: 700_000,
        originalAmount: before,
        adjustmentReason: 'Discount agreed',
        status: 'paid',
      });
      expect(t.auditEntries.map((e) => e.action)).toContain('installment.adjust_amount');
    });

    it('leaves the invoice untouched when the card is declined, and lets the buyer try another card in the same form', async () => {
      const a = await open();
      const bad = await payInCheckout(t, stripeSession(a.checkoutId), DECLINED);
      expect(bad.status).toBe(402);
      expect(bad.body.error).toMatchObject({
        code: 'card_declined',
        decline_code: 'generic_decline',
      });
      await hook(eventsOf('payment_intent.payment_failed')[0]);
      let state = await status(a.checkoutId);
      expect(state.checkout.status).toBe('open');
      expect(state.transaction).toMatchObject({
        status: 'pending',
        failureCode: 'generic_decline',
        failureMessage: 'Your card was declined.',
      });
      expect(state.transaction.stripeResponse).toMatchObject({ object: 'payment_intent' });
      expect(emi().paidAmount).toBe(0);
      expect(payments()).toHaveLength(0);

      await payInCheckout(t, stripeSession(a.checkoutId), VISA);
      state = await status(a.checkoutId);
      expect(state.transaction).toMatchObject({ status: 'succeeded', failureCode: null });
      expect(payments()).toHaveLength(1);
    });

    it('refunds the card instead of booking when the invoice balance changed after the session was opened', async () => {
      const a = await open({});
      await payInCheckout(t, stripeSession(a.checkoutId), VISA);
      await uc(RecordPayment).execute({ actor: finance, id: emi().id, input: { method: 'cash' } }); // paid by hand meanwhile
      const state = await status(a.checkoutId);
      expect(state.transaction).toMatchObject({
        status: 'refunded',
        failureCode: 'BALANCE_CHANGED',
        stripeRefundId: expect.stringMatching(/^re_/),
      });
      expect(state.transaction.stripeResponse.refund).toMatchObject({
        object: 'refund',
        status: 'succeeded',
      });
      expect(payments()).toHaveLength(0);
      expect(t.stripeMock.state.refunds.size).toBe(1);
      expect(t.auditEntries.map((e) => e.action)).toContain('payment.auto_refund');
      await status(a.checkoutId);
      expect(t.stripeMock.state.refunds.size).toBe(1); // not refunded twice
    });

    it('cancels the transaction when the session expires', async () => {
      const a = await open();
      await fetch(
        `${t.stripeMock.url}/_mock/checkout-sessions/${stripeSession(a.checkoutId)}/expire-now`,
        { method: 'POST' },
      );
      await hook(eventsOf('checkout.session.expired')[0]);
      const state = await status(a.checkoutId);
      expect(state.checkout.status).toBe('expired');
      expect(state.transaction.status).toBe('canceled');
      expect(emi().paidAmount).toBe(0);
    });

    it('saves the card used when asked to, making it the active card', async () => {
      const a = await open({ amount: 500_000, saveCard: true });
      await payInCheckout(t, stripeSession(a.checkoutId), MASTERCARD);
      await status(a.checkoutId);
      const methods = await uc(ListPaymentMethods).execute({
        actor: finance,
        customerId: CUSTOMER,
      });
      expect(methods).toEqual([
        expect.objectContaining({
          brand: 'mastercard',
          last4: '4444',
          isActive: true,
          addedVia: 'staff',
        }),
      ]);
    });

    it('does not find a checkout of another tenant', async () => {
      const a = await open();
      await expect(
        uc(GetCheckoutSession).execute({
          actor: actor('finance', { tenantId: uuid(9) }),
          id: a.checkoutId,
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('webhooks', () => {
    it('ignores sessions it did not open and event types it does not use, but remembers them', async () => {
      const foreign = {
        id: 'evt_f',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_test_foreign' } },
      };
      expect(await hook(foreign)).toMatchObject({ duplicate: false, outcome: 'ignored' });
      expect(
        await hook({ id: 'evt_g', type: 'customer.created', data: { object: {} } }),
      ).toMatchObject({ outcome: 'ignored' });
      expect(t.stores.stripeEvents.get('evt_f').status).toBe('ignored');
      expect((await hook(foreign)).duplicate).toBe(true);
    });

    it('forgets an event whose processing failed so Stripe’s retry is handled again', async () => {
      const a = await open();
      await payInCheckout(t, stripeSession(a.checkoutId), VISA);
      const completed = eventsOf('checkout.session.completed')[0];
      const real = t.deps.gateway.retrieveSession;
      t.deps.gateway.retrieveSession = async () => {
        throw new Error('stripe unreachable');
      };
      await expect(hook(completed)).rejects.toThrow('unreachable');
      expect(t.stores.stripeEvents.has(completed.id)).toBe(false);
      t.deps.gateway.retrieveSession = real;
      expect((await hook(completed)).outcome).toBe('paid');
    });

    it('records a background card failure as final and leaves unknown intents alone', async () => {
      expect(
        await hook({
          id: 'evt_u',
          type: 'payment_intent.payment_failed',
          data: { object: { id: 'pi_unknown', metadata: {}, last_payment_error: {} } },
        }),
      ).toMatchObject({ outcome: 'ignored' });
    });
  });

  describe('saved cards', () => {
    it('saves a card through a setup session; the first card becomes active, later ones do not', async () => {
      await saveCard(VISA);
      await saveCard(MASTERCARD);
      const methods = await uc(ListPaymentMethods).execute({
        actor: finance,
        customerId: CUSTOMER,
      });
      expect(methods.map((m) => [m.brand, m.isActive])).toEqual([
        ['visa', true],
        ['mastercard', false],
      ]);
      expect(methods.every((m) => m.expired === false)).toBe(true);
      expect(t.auditEntries.filter((e) => e.action === 'payment_method.add')).toHaveLength(2);
    });

    it('does not store the same physical card twice', async () => {
      await saveCard(VISA);
      await saveCard(VISA);
      expect(
        await uc(ListPaymentMethods).execute({ actor: finance, customerId: CUSTOMER }),
      ).toHaveLength(1);
    });

    it('switches the active card, and promotes the newest remaining card when the active one is removed', async () => {
      await saveCard(VISA);
      await saveCard(MASTERCARD);
      const [visa, master] = await uc(ListPaymentMethods).execute({
        actor: finance,
        customerId: CUSTOMER,
      });
      await uc(SetActivePaymentMethod).execute({
        actor: finance,
        customerId: CUSTOMER,
        id: master.id,
      });
      let list = await uc(ListPaymentMethods).execute({ actor: finance, customerId: CUSTOMER });
      expect(list.filter((m) => m.isActive).map((m) => m.brand)).toEqual(['mastercard']);

      const removed = await uc(RemovePaymentMethod).execute({
        actor: finance,
        customerId: CUSTOMER,
        id: master.id,
      });
      expect(removed.activeId).toBe(visa.id);
      list = await uc(ListPaymentMethods).execute({ actor: finance, customerId: CUSTOMER });
      expect(list.map((m) => [m.brand, m.isActive])).toEqual([['visa', true]]);
      expect(
        [...t.stripeMock.state.paymentMethods.values()].find(
          (p) => p.id === master.stripePaymentMethodId,
        ).customer,
      ).toBeNull();
      await expect(
        uc(SetActivePaymentMethod).execute({ actor: finance, customerId: CUSTOMER, id: master.id }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await uc(RemovePaymentMethod).execute({ actor: finance, customerId: CUSTOMER, id: visa.id });
      expect(
        await uc(ListPaymentMethods).execute({ actor: finance, customerId: CUSTOMER }),
      ).toEqual([]);
    });

    it('keeps one customer’s cards away from another and needs the card permission', async () => {
      await saveCard(VISA);
      const [card] = await uc(ListPaymentMethods).execute({ actor: finance, customerId: CUSTOMER });
      await expect(
        uc(RemovePaymentMethod).execute({ actor: finance, customerId: uuid(777), id: card.id }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        uc(ListPaymentMethods).execute({ actor: actor('sales_agent'), customerId: CUSTOMER }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        uc(CreateCardSetupSession).execute({ actor: actor('sales_agent'), customerId: CUSTOMER }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        uc(CreateCardSetupSession).execute({ actor: finance, customerId: uuid(778) }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('charges the active saved card, books the payment and stores Stripe’s answer', async () => {
      await saveCard(VISA);
      const r = await uc(ChargeSavedCard).execute({
        actor: finance,
        id: emi().id,
        input: { amount: 400_000 },
        attemptKey: 'a1',
      });
      expect(r.transaction).toMatchObject({
        status: 'succeeded',
        trigger: 'staff_saved_card',
        cardLast4: '4242',
        amount: 400_000,
      });
      expect(r.transaction.stripeResponse).toMatchObject({
        object: 'payment_intent',
        status: 'succeeded',
      });
      expect(payments()).toHaveLength(1);
      expect(emi().paidAmount).toBe(400_000);
    });

    it('repeats of the same attempt return the first result without charging again', async () => {
      await saveCard(VISA);
      const run = () =>
        uc(ChargeSavedCard).execute({
          actor: finance,
          id: emi().id,
          input: { amount: 400_000 },
          attemptKey: 'same',
        });
      const first = await run();
      const second = await run();
      expect(second).toMatchObject({ repeated: true, transaction: { id: first.transaction.id } });
      expect(payments()).toHaveLength(1);
      expect(t.stripeMock.state.paymentIntents.size).toBe(1);
      const other = await uc(ChargeSavedCard).execute({
        actor: finance,
        id: emi().id,
        input: { amount: 100_000 },
        attemptKey: 'next',
      });
      expect(other.transaction.status).toBe('succeeded');
      expect(emi().paidAmount).toBe(500_000);
    });

    it('records a declined saved card as failed with the Stripe reason, leaving the invoice as it was', async () => {
      await saveCard(DECLINED).catch(() => {});
      // a card that saves fine but declines when charged off-session
      await saveCard(NEEDS_3DS);
      const r = await uc(ChargeSavedCard).execute({
        actor: finance,
        id: emi().id,
        input: {},
        attemptKey: 'x',
      });
      expect(r).toMatchObject({
        failed: true,
        transaction: { status: 'failed', failureCode: 'authentication_required' },
      });
      expect(r.transaction.stripeResponse).toBeTruthy();
      expect(emi().paidAmount).toBe(0);
      expect(payments()).toHaveLength(0);
      expect(t.auditEntries.map((e) => e.action)).toContain('payment.card_failed');
    });

    it('refuses to charge when there is no saved card, the card expired, or the invoice cannot be paid', async () => {
      await expect(
        uc(ChargeSavedCard).execute({ actor: finance, id: emi().id, input: {}, attemptKey: 'n' }),
      ).rejects.toMatchObject({ code: 'NO_ACTIVE_CARD' });
      await saveCard(VISA);
      const [card] = [...t.stores.methods.values()];
      card.expYear = 2020;
      await expect(
        uc(ChargeSavedCard).execute({ actor: finance, id: emi().id, input: {}, attemptKey: 'e' }),
      ).rejects.toMatchObject({ code: 'CARD_EXPIRED' });
      card.expYear = 2030;
      await uc(RecordPayment).execute({ actor: finance, id: emi().id, input: { method: 'cash' } });
      await expect(
        uc(ChargeSavedCard).execute({ actor: finance, id: emi().id, input: {}, attemptKey: 'p' }),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
      await expect(
        uc(ChargeSavedCard).execute({
          actor: actor('sales_agent'),
          id: emi().id,
          input: {},
          attemptKey: 'f',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('refunds when the balance moved while Stripe was charging', async () => {
      await saveCard(VISA);
      const real = t.deps.gateway.chargeSavedCard;
      t.deps.gateway.chargeSavedCard = async (...args) => {
        const result = await real(...args);
        await uc(RecordPayment).execute({
          actor: finance,
          id: emi().id,
          input: { method: 'cash' },
        });
        return result;
      };
      const r = await uc(ChargeSavedCard).execute({
        actor: finance,
        id: emi().id,
        input: { amount: 300_000 },
        attemptKey: 'race',
      });
      expect(r).toMatchObject({
        refunded: true,
        transaction: { status: 'refunded', failureCode: 'BALANCE_CHANGED' },
      });
      expect(payments()).toHaveLength(0);
      expect(t.stripeMock.state.refunds.size).toBe(1);
    });
  });

  describe('the transaction ledger', () => {
    it('lists transactions newest first with filters and paging, without the raw Stripe answer', async () => {
      await saveCard(VISA);
      for (const key of ['t1', 't2', 't3']) {
        t.clock.advanceDays(1);
        await uc(ChargeSavedCard).execute({
          actor: finance,
          id: emi().id,
          input: { amount: 100_000 },
          attemptKey: key,
        });
      }
      const first = await uc(ListTransactions).execute({
        actor: finance,
        installmentId: emi().id,
        limit: 2,
      });
      expect(first.items).toHaveLength(2);
      expect(first.items[0].createdAt >= first.items[1].createdAt).toBe(true);
      expect(first.items[0]).not.toHaveProperty('stripeResponse');
      expect(first.next).toBeTruthy();
      const rest = await uc(ListTransactions).execute({
        actor: finance,
        installmentId: emi().id,
        limit: 2,
        cursor: first.next,
      });
      expect(rest.items).toHaveLength(1);
      expect(rest.next).toBeNull();
      expect(
        (await uc(ListTransactions).execute({ actor: finance, status: 'failed' })).items,
      ).toEqual([]);
      expect(
        (await uc(ListTransactions).execute({ actor: finance, customerId: CUSTOMER })).items,
      ).toHaveLength(3);
      await expect(
        uc(ListTransactions).execute({ actor: actor('marketing') }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('shows one transaction with Stripe’s stored answer to those who may take card payments', async () => {
      await saveCard(VISA);
      const { transaction } = await uc(ChargeSavedCard).execute({
        actor: finance,
        id: emi().id,
        input: { amount: 100_000 },
        attemptKey: 'd',
      });
      const got = await uc(GetTransaction).execute({ actor: finance, id: transaction.id });
      expect(got.stripeResponse).toMatchObject({ object: 'payment_intent', amount: 100_000 });
      await expect(
        uc(GetTransaction).execute({ actor: actor('auditor'), id: transaction.id }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        uc(GetTransaction).execute({ actor: finance, id: uuid(5) }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('over HTTP', () => {
    const auth = (role = 'finance') => t.auth.bearer({ role, tenantId: TEST_TENANT_A });
    const send = async (method, path, body, role) =>
      request(t.app)
        [method](`${BASE}${path}`)
        .set(await auth(role))
        .send(body);

    it('opens a checkout, settles it from the return page and shows the transaction', async () => {
      const created = await send('post', `/installments/${emi().id}/checkout-session`, {
        amount: 250_000,
        save_card: true,
      });
      expect(created.status).toBe(201);
      expect(created.body).toEqual({
        checkout_id: expect.any(String),
        client_secret: expect.stringMatching(/_secret_/),
        publishable_key: 'pk_test_mock',
        amount: 250_000,
        currency: 'PKR',
      });
      await payInCheckout(t, stripeSession(created.body.checkout_id), VISA);
      const status = await send('get', `/checkout-sessions/${created.body.checkout_id}`);
      expect(status.body).toMatchObject({
        status: 'complete',
        transaction: { status: 'succeeded', card_last4: '4242', amount: 250_000 },
      });
      expect(status.body.transaction).not.toHaveProperty('stripe_response');

      const list = await send('get', `/transactions?installment_id=${emi().id}`);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.next_cursor).toBeNull();
      const detail = await send('get', `/transactions/${list.body.data[0].id}`);
      expect(detail.body.stripe_response.checkout_session.object).toBe('checkout.session');
      expect((await send('get', `/customers/${CUSTOMER}/payment-methods`)).body.data).toEqual([
        expect.objectContaining({ brand: 'visa', last4: '4242', is_active: true, expired: false }),
      ]);
    });

    it('manages saved cards and charges one, answering with the failed transaction for a declined charge', async () => {
      const setup = await send('post', `/customers/${CUSTOMER}/payment-methods/setup-session`);
      expect(setup.status).toBe(201);
      expect(setup.body).toEqual({
        checkout_id: expect.any(String),
        client_secret: expect.any(String),
        publishable_key: 'pk_test_mock',
      });
      await payInCheckout(t, stripeSession(setup.body.checkout_id), NEEDS_3DS);
      await send('get', `/checkout-sessions/${setup.body.checkout_id}`);
      const cards = await send('get', `/customers/${CUSTOMER}/payment-methods`);
      expect(cards.body.data).toHaveLength(1);

      const declined = await send('post', `/installments/${emi().id}/charge-saved-card`, {});
      expect(declined.status).toBe(201);
      expect(declined.body).toMatchObject({
        status: 'failed',
        failure_code: 'authentication_required',
      });

      expect(
        (
          await send(
            'post',
            `/customers/${CUSTOMER}/payment-methods/${cards.body.data[0].id}/activate`,
          )
        ).body.is_active,
      ).toBe(true);
      expect(
        (await send('delete', `/customers/${CUSTOMER}/payment-methods/${cards.body.data[0].id}`))
          .status,
      ).toBe(204);
      expect(
        (await send('delete', `/customers/${CUSTOMER}/payment-methods/${cards.body.data[0].id}`))
          .status,
      ).toBe(404);
      expect((await send('post', `/installments/${emi().id}/charge-saved-card`, {})).status).toBe(
        409,
      );
    });

    it('turns validation and permission problems into the usual errors', async () => {
      expect(
        (await send('post', `/installments/${emi().id}/checkout-session`, { amount: 'ten' }))
          .status,
      ).toBe(422);
      expect(
        (await send('post', `/installments/${emi().id}/checkout-session`, {}, 'sales_agent'))
          .status,
      ).toBe(403);
      expect((await send('get', '/transactions?status=exploded')).status).toBe(422);
      expect((await send('get', '/transactions/not-a-uuid')).status).toBe(404);
    });

    it('accepts Stripe’s signed webhook, refuses a bad signature and processes each event once', async () => {
      const a = await open({});
      await payInCheckout(t, stripeSession(a.checkoutId), VISA);
      const event = eventsOf('checkout.session.completed')[0];
      const body = JSON.stringify(event);
      const post = (signature) =>
        request(t.app)
          .post('/webhooks/stripe')
          .set('content-type', 'application/json')
          .set('stripe-signature', signature)
          .send(body);

      const bad = await post('t=1,v1=deadbeef');
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('BAD_SIGNATURE');
      expect((await request(t.app).post('/webhooks/stripe').send(body)).status).toBe(400);
      expect(payments()).toHaveLength(0);

      const signature = t.stripeMock.sign(body);
      expect((await post(signature)).body).toEqual({ received: true, duplicate: false });
      expect((await post(signature)).body).toEqual({ received: true, duplicate: true });
      expect(payments()).toHaveLength(1);
      expect(emi().status).toBe('paid');
    });
  });
});
