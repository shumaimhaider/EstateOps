import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { EVENT, buildEvent } from '@estateops/contracts';
import { TEST_TENANT_A, TEST_TENANT_B } from '@estateops/platform/testing';
import { CreateSchedule } from '../src/installments/application/CreateSchedule.js';
import { RecordPayment } from '../src/installments/application/RecordPayment.js';
import { CONFIRMED, actor, buildBillingTest, payInCheckout, uuid } from './fakes.js';

const PORTAL = '/api/v1/portal';
const ME = uuid(301);
const OTHER = uuid(302);
const MY_BOOKING = uuid(500);
const THEIR_BOOKING = uuid(600);

describe('customer portal: invoices, cards and payments', () => {
  let t;
  let me;
  const ev = (data) =>
    buildEvent({
      type: EVENT.BOOKING_CONFIRMED,
      tenantId: TEST_TENANT_A,
      producer: 'x',
      data,
      now: t.clock.now(),
    });
  const api = (method, path, body, headers = me) =>
    request(t.app)[method](`${PORTAL}${path}`).set(headers).send(body);
  const invoicesOf = (booking) =>
    [...t.stores.invoices.values()]
      .filter((i) => i.bookingId === booking)
      .sort((a, b) => a.seq - b.seq);
  const mine = () => invoicesOf(MY_BOOKING);
  const stripeSession = (checkoutId) => t.stores.checkouts.get(checkoutId).stripeSessionId;

  beforeEach(async () => {
    t = await buildBillingTest();
    for (const [id, name, email] of [
      [ME, 'Ali Raza', 'ali@example.test'],
      [OTHER, 'Bilal Khan', 'bilal@example.test'],
    ]) {
      t.stores.customerRefs.set(id, {
        customerId: id,
        tenantId: TEST_TENANT_A,
        fullName: name,
        phone: null,
        email,
      });
    }
    await new CreateSchedule(t.deps).execute(ev(CONFIRMED({ booked_at: '2026-05-01' })));
    await new CreateSchedule(t.deps).execute(
      ev(
        CONFIRMED({
          booking_id: THEIR_BOOKING,
          unit: { ...CONFIRMED().unit, id: uuid(102), unit_no: 'B-07' },
          customer: {
            id: OTHER,
            full_name: 'Bilal Khan',
            phone: null,
            email: 'bilal@example.test',
          },
          booked_at: '2026-05-01',
        }),
      ),
    );
    me = await t.auth.customerBearer({ customerId: ME, tenantId: TEST_TENANT_A, name: 'Ali Raza' });
  });

  describe('a property’s invoices', () => {
    it('lists the customer’s own schedule in the customer-safe shape, with what can be paid', async () => {
      const res = await api('get', `/properties/${MY_BOOKING}/invoices`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(mine().length);
      expect(res.body.data[0]).toEqual({
        id: expect.any(String),
        invoice_no: expect.stringMatching(/^INV-PK-/),
        kind: 'down_payment',
        seq: 0,
        status: 'overdue',
        issued_on: expect.any(String),
        due_date: '2026-05-01',
        amount: expect.any(Number),
        paid_amount: 0,
        balance: expect.any(Number),
        fine_amount: expect.any(Number),
        currency: 'PKR',
        days_late: expect.any(Number),
        paid_at: null,
        receipt_no: null,
        payable: true,
      });
      expect(res.body.data.at(-1)).toMatchObject({ status: 'scheduled', payable: true });
      expect(JSON.stringify(res.body)).not.toMatch(
        /allowed_actions|payment_reference|adjustment_reason|created_at|stripe|customer_id|tenant_id/,
      );
    });

    it('does not reveal another customer’s property, a made-up one, or another tenant’s', async () => {
      for (const id of [THEIR_BOOKING, uuid(999)])
        expect((await api('get', `/properties/${id}/invoices`)).status).toBe(404);
      const stranger = await t.auth.customerBearer({ customerId: ME, tenantId: TEST_TENANT_B });
      expect(
        (await api('get', `/properties/${MY_BOOKING}/invoices`, undefined, stranger)).status,
      ).toBe(404);
    });

    it('shows a paid invoice with its receipt and no longer offers to pay it', async () => {
      await new RecordPayment(t.deps).execute({
        actor: actor('finance'),
        id: mine()[0].id,
        input: { method: 'cash' },
      });
      const first = (await api('get', `/properties/${MY_BOOKING}/invoices`)).body.data[0];
      expect(first).toMatchObject({
        status: 'paid',
        balance: 0,
        payable: false,
        receipt_no: expect.stringMatching(/^RCT-PK-/),
      });
    });
  });

  describe('paying on Stripe’s form', () => {
    it('opens a checkout for the customer’s own invoice, books the payment as theirs and shows the outcome', async () => {
      const invoice = mine()[1];
      const opened = await api('post', `/invoices/${invoice.id}/checkout-session`, {
        amount: 100_000,
        save_card: true,
      });
      expect(opened.status).toBe(201);
      expect(opened.body).toEqual({
        checkout_id: expect.any(String),
        client_secret: expect.stringMatching(/_secret_/),
        publishable_key: 'pk_test_mock',
        amount: 100_000,
        currency: 'PKR',
      });
      const checkout = t.stores.checkouts.get(opened.body.checkout_id);
      expect(checkout).toMatchObject({
        createdVia: 'customer',
        customerId: ME,
        createdByName: 'Ali Raza',
      });
      expect([...t.stores.transactions.values()][0]).toMatchObject({
        trigger: 'customer_checkout',
        customerId: ME,
      });

      await payInCheckout(t, stripeSession(opened.body.checkout_id));
      const done = await api('get', `/checkout-sessions/${opened.body.checkout_id}`);
      expect(done.body).toMatchObject({
        status: 'complete',
        transaction: { status: 'succeeded', card_last4: '4242', amount: 100_000 },
      });
      expect(done.body.transaction).not.toHaveProperty('stripe_response');
      expect(invoicesOf(MY_BOOKING)[1].paidAmount).toBe(100_000);
      expect(t.stores.payments.at(-1)).toMatchObject({
        source: 'stripe',
        recordedByName: 'Ali Raza',
      });
      expect([...t.stores.methods.values()]).toEqual([
        expect.objectContaining({ customerId: ME, addedVia: 'customer', isActive: true }),
      ]);
      expect(t.events.filter((e) => e.type === 'payment.charge_succeeded')).toHaveLength(1);
    });

    it('cannot touch another customer’s invoice or checkout, and cannot adjust an amount', async () => {
      const theirs = invoicesOf(THEIR_BOOKING)[1];
      expect((await api('post', `/invoices/${theirs.id}/checkout-session`, {})).status).toBe(404);
      expect((await api('post', `/invoices/${theirs.id}/charge-saved-card`, {})).status).toBe(404);
      expect((await api('post', `/invoices/${uuid(999)}/checkout-session`, {})).status).toBe(404);
      const adjust = await api('post', `/invoices/${mine()[1].id}/checkout-session`, {
        adjusted_amount: 100,
        adjustment_reason: 'cheaper please',
      });
      expect(adjust.status).toBe(403);
      expect(t.stores.checkouts.size).toBe(0);

      const other = await t.auth.customerBearer({ customerId: OTHER, tenantId: TEST_TENANT_A });
      const opened = await api('post', `/invoices/${mine()[1].id}/checkout-session`, {});
      expect(opened.status).toBe(201);
      expect(
        (await api('get', `/checkout-sessions/${opened.body.checkout_id}`, undefined, other))
          .status,
      ).toBe(404);
    });

    it('refuses amounts above the balance and invoices that cannot be paid', async () => {
      const invoice = mine()[1];
      expect(
        (
          await api('post', `/invoices/${invoice.id}/checkout-session`, {
            amount: invoice.amount + 1,
          })
        ).status,
      ).toBe(422);
      await new RecordPayment(t.deps).execute({
        actor: actor('finance'),
        id: invoice.id,
        input: { method: 'cash' },
      });
      expect((await api('post', `/invoices/${invoice.id}/checkout-session`, {})).status).toBe(409);
    });
  });

  describe('saved cards', () => {
    const addCard = async (number) => {
      const setup = await api('post', '/payment-methods/setup-session');
      await payInCheckout(t, stripeSession(setup.body.checkout_id), number);
      await api('get', `/checkout-sessions/${setup.body.checkout_id}`);
      return setup;
    };

    it('adds several cards, keeps one active, switches and removes — always their own', async () => {
      const setup = await api('post', '/payment-methods/setup-session');
      expect(setup.status).toBe(201);
      expect(t.stores.checkouts.get(setup.body.checkout_id)).toMatchObject({
        customerId: ME,
        createdVia: 'customer',
      });
      await payInCheckout(t, stripeSession(setup.body.checkout_id));
      await api('get', `/checkout-sessions/${setup.body.checkout_id}`);
      await addCard('5555555555554444');
      const list = (await api('get', '/payment-methods')).body.data;
      expect(list.map((c) => [c.brand, c.is_active, c.added_via])).toEqual([
        ['visa', true, 'customer'],
        ['mastercard', false, 'customer'],
      ]);

      const master = list[1];
      expect((await api('post', `/payment-methods/${master.id}/activate`)).body.is_active).toBe(
        true,
      );
      expect((await api('delete', `/payment-methods/${master.id}`)).status).toBe(204);
      expect((await api('get', '/payment-methods')).body.data.map((c) => c.is_active)).toEqual([
        true,
      ]);
    });

    it('never shows or changes a card that belongs to somebody else', async () => {
      await addCard('4242424242424242');
      const theirs = await t.auth.customerBearer({ customerId: OTHER, tenantId: TEST_TENANT_A });
      expect((await api('get', '/payment-methods', undefined, theirs)).body.data).toEqual([]);
      const [card] = (await api('get', '/payment-methods')).body.data;
      expect((await api('post', `/payment-methods/${card.id}/activate`, {}, theirs)).status).toBe(
        404,
      );
      expect((await api('delete', `/payment-methods/${card.id}`, undefined, theirs)).status).toBe(
        404,
      );
      expect((await api('get', '/payment-methods')).body.data).toHaveLength(1);
    });

    it('pays an invoice with the active card, once per idempotency key, and reports a refused card', async () => {
      await addCard('4242424242424242');
      const invoice = mine()[1];
      const pay = (key, body = { amount: 50_000 }) =>
        request(t.app)
          .post(`${PORTAL}/invoices/${invoice.id}/charge-saved-card`)
          .set({ ...me, 'Idempotency-Key': key })
          .send(body);
      const first = await pay('pay-1');
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({
        status: 'succeeded',
        trigger: 'customer_saved_card',
        amount: 50_000,
        card_last4: '4242',
      });
      expect(first.body).not.toHaveProperty('stripe_response');
      const again = await pay('pay-1');
      expect(again.headers['idempotent-replay'] ?? again.body.id).toBeTruthy();
      expect(invoicesOf(MY_BOOKING)[1].paidAmount).toBe(50_000);

      await addCard('4000002500003155');
      const cards = (await api('get', '/payment-methods')).body.data;
      await api('post', `/payment-methods/${cards.find((c) => !c.is_active).id}/activate`);
      const declined = await pay('pay-2', { amount: 10_000 });
      expect(declined.body).toMatchObject({
        status: 'failed',
        failure_message: expect.stringMatching(/authentication/),
      });
      expect(invoicesOf(MY_BOOKING)[1].paidAmount).toBe(50_000);
    });
  });

  describe('the customer’s transactions', () => {
    it('lists only their own attempts, newest first, with filters and paging, and nothing Stripe-internal', async () => {
      const setup = await api('post', '/payment-methods/setup-session');
      await payInCheckout(t, stripeSession(setup.body.checkout_id));
      await api('get', `/checkout-sessions/${setup.body.checkout_id}`);
      for (const key of ['a', 'b', 'c']) {
        t.clock.advanceDays(1);
        await request(t.app)
          .post(`${PORTAL}/invoices/${mine()[1].id}/charge-saved-card`)
          .set({ ...me, 'Idempotency-Key': key })
          .send({ amount: 10_000 });
      }
      const theirs = invoicesOf(THEIR_BOOKING)[1];
      await t.deps.gateway.createCustomer({ email: 'x@y.z', name: 'x' });
      expect(theirs).toBeTruthy();

      const first = await api('get', '/transactions?limit=2');
      expect(first.body.data).toHaveLength(2);
      expect(first.body.next_cursor).toEqual(expect.any(String));
      const rest = await api(
        'get',
        `/transactions?limit=2&cursor=${encodeURIComponent(first.body.next_cursor)}`,
      );
      expect(rest.body.data).toHaveLength(1);
      expect((await api('get', `/transactions?invoice_id=${mine()[1].id}`)).body.data).toHaveLength(
        3,
      );
      expect(JSON.stringify(first.body)).not.toMatch(
        /stripe_|created_by|customer_id|payment_intent/,
      );
      const other = await t.auth.customerBearer({ customerId: OTHER, tenantId: TEST_TENANT_A });
      expect((await api('get', '/transactions', undefined, other)).body.data).toEqual([]);
    });
  });

  describe('keeping the two kinds of sign-in apart', () => {
    it('refuses staff tokens on the portal and customer tokens on the staff API and on staff payment routes', async () => {
      const staff = await t.auth.bearer({ role: 'finance', tenantId: TEST_TENANT_A });
      expect((await api('get', '/payment-methods', undefined, staff)).status).toBe(401);
      expect((await api('get', `/properties/${MY_BOOKING}/invoices`, undefined, {})).status).toBe(
        401,
      );
      expect((await request(t.app).get('/api/v1/admin/transactions').set(me)).status).toBe(401);
      expect(
        (
          await request(t.app)
            .post(`/api/v1/admin/installments/${mine()[1].id}/checkout-session`)
            .set(me)
            .send({})
        ).status,
      ).toBe(401);
    });
  });
});
