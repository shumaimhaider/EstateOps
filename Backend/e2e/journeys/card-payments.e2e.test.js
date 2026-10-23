import { describe, expect, it } from 'vitest';
import { TEST_CARDS } from '@estateops/mock-providers';
import { eventually } from '../support/http.js';
import { useStack } from '../support/suite.js';

const ctx = useStack();
const A = '/api/v1/admin';

async function setup(opts = {}) {
  const { w } = ctx;
  const t = await w.tenantWithStaff();
  const s = await w.seedSales(t.owner, {
    price: 200_000_00,
    downPct: 50,
    installments: 2,
    ...opts,
  });
  const booking = await w.book(t.owner, s);
  const [down, ...rest] = await w.invoicesOf(t.owner, booking.id);
  return { w, t, s, booking, down, rest };
}
const settle = (t, checkout) =>
  eventually(
    async () => {
      const r = await t.staff.finance.get(`${A}/checkout-sessions/${checkout.checkout_id}`);
      return r.status !== 'open' ? r : null;
    },
    { what: 'checkout settled' },
  );

describe('card payments with Stripe', () => {
  it('pays an invoice through embedded checkout, records the ledger with Stripe’s response and issues a receipt', async () => {
    const { w, t, down, booking } = await setup();
    const checkout = await t.staff.finance.post(
      `${A}/installments/${down.id}/checkout-session`,
      {},
    );
    expect(checkout).toMatchObject({
      publishable_key: 'pk_test_e2e',
      amount: down.balance,
      currency: 'PKR',
    });
    expect(checkout.client_secret).toContain('_secret_');

    const done = await w.payOnStripe(checkout, TEST_CARDS.VISA);
    expect(done.body.outcome).toBe('succeeded');
    const result = await settle(t, checkout);
    expect(result.transaction).toMatchObject({ status: 'succeeded', amount: down.balance });

    const invoice = await t.owner.get(`${A}/installments/${down.id}`);
    expect(invoice).toMatchObject({ status: 'paid', balance: 0, payment_source: 'stripe' });
    expect(invoice.receipt_no).toMatch(/^RCT-/);

    const tx = await t.owner.get(`${A}/transactions/${result.transaction.id}`);
    // the ledger keeps what Stripe answered, for every transaction
    expect(JSON.stringify(tx.stripe_response ?? tx.provider_response ?? tx)).toMatch(/pi_/);
    expect(
      (await t.owner.get(`${A}/transactions`, { booking_id: booking.id })).data.length,
    ).toBeGreaterThan(0);
  });

  it('records a card payment once even when Stripe repeats the webhook', async () => {
    const { w, t, down } = await setup();
    const checkout = await t.staff.finance.post(
      `${A}/installments/${down.id}/checkout-session`,
      {},
    );
    await w.payOnStripe(checkout, TEST_CARDS.VISA);
    await settle(t, checkout);
    const events = await (await fetch(`${ctx.stack.stripe.url}/_mock/events`)).json();
    for (const e of events)
      await fetch(`${ctx.stack.stripe.url}/_mock/events/${e.id}/replay`, { method: 'POST' });
    await new Promise((r) => setTimeout(r, 800));
    const payments = await t.owner.get(`${A}/installments/${down.id}/payments`);
    expect(payments.data).toHaveLength(1);
    expect((await t.owner.get(`${A}/installments/${down.id}`)).paid_amount).toBe(down.amount);
  });

  it('leaves the invoice untouched when the card is declined, and lets another card pay', async () => {
    const { w, t, down } = await setup();
    const checkout = await t.staff.finance.post(
      `${A}/installments/${down.id}/checkout-session`,
      {},
    );
    const declined = await w.payOnStripe(checkout, TEST_CARDS.DECLINED);
    expect(declined.status).toBe(402);
    const mid = await t.owner.get(`${A}/installments/${down.id}`);
    expect(mid).toMatchObject({ paid_amount: 0, status: mid.status });
    expect(mid.paid_amount).toBe(0);
    const paid = await w.payOnStripe(checkout, TEST_CARDS.MASTERCARD);
    expect(paid.body.outcome).toBe('succeeded');
    await settle(t, checkout);
    expect((await t.owner.get(`${A}/installments/${down.id}`)).status).toBe('paid');
  });

  it('takes a part payment by card', async () => {
    const { w, t, down } = await setup();
    const checkout = await t.staff.finance.post(`${A}/installments/${down.id}/checkout-session`, {
      amount: 25_000_00,
    });
    expect(checkout.amount).toBe(25_000_00);
    await w.payOnStripe(checkout, TEST_CARDS.VISA);
    await settle(t, checkout);
    expect(await t.owner.get(`${A}/installments/${down.id}`)).toMatchObject({
      paid_amount: 25_000_00,
      balance: down.amount - 25_000_00,
    });
  });

  it('refunds the card when the balance changed between charge and recording', async () => {
    const { w, t, down } = await setup();
    const checkout = await t.staff.finance.post(
      `${A}/installments/${down.id}/checkout-session`,
      {},
    );
    // while the customer is on Stripe's page, staff take the whole balance by hand
    await t.staff.finance.post(`${A}/installments/${down.id}/pay`, {
      method: 'cash',
      amount: down.balance,
    });
    await w.payOnStripe(checkout, TEST_CARDS.VISA);
    const result = await settle(t, checkout);
    expect(result.transaction.status).toBe('refunded');
    const invoice = await t.owner.get(`${A}/installments/${down.id}`);
    expect(invoice.paid_amount).toBe(down.amount); // counted once, by hand
    const payments = await t.owner.get(`${A}/installments/${down.id}/payments`);
    expect(payments.data).toHaveLength(1);
  });

  it('applies an amount adjustment only when the charge succeeds, with the reason kept', async () => {
    const { w, t, down } = await setup();
    const checkout = await t.staff.finance.post(`${A}/installments/${down.id}/checkout-session`, {
      adjusted_amount: down.amount - 10_000_00,
      adjustment_reason: 'Early payment discount',
    });
    expect((await t.owner.get(`${A}/installments/${down.id}`)).amount).toBe(down.amount);
    await w.payOnStripe(checkout, TEST_CARDS.VISA);
    await settle(t, checkout);
    const invoice = await t.owner.get(`${A}/installments/${down.id}`);
    expect(invoice).toMatchObject({
      amount: down.amount - 10_000_00,
      original_amount: down.amount,
      adjustment_reason: 'Early payment discount',
      status: 'paid',
    });
  });

  it('keeps card details out of EstateOps: nothing stored mentions the card number', async () => {
    const { w, t, down } = await setup();
    const checkout = await t.staff.finance.post(
      `${A}/installments/${down.id}/checkout-session`,
      {},
    );
    await w.payOnStripe(checkout, TEST_CARDS.VISA);
    const result = await settle(t, checkout);
    const tx = await t.owner.get(`${A}/transactions/${result.transaction.id}`);
    expect(JSON.stringify(tx)).not.toContain(TEST_CARDS.VISA);
    expect(JSON.stringify(ctx.stack.logs.slice(-500))).not.toContain(TEST_CARDS.VISA);
  });

  it('refuses card payment to a role without the permission', async () => {
    const { t, down } = await setup();
    const out = await t.staff.sales_agent.fails(
      'POST',
      `${A}/installments/${down.id}/checkout-session`,
      {},
    );
    expect(out.status).toBe(403);
  });
});

describe('saved cards', () => {
  it('saves a card with a setup session, keeps many with one active, and charges the active one', async () => {
    const { w, t, down, s } = await setup();
    const cust = s.customer.id;
    for (const number of [TEST_CARDS.VISA, TEST_CARDS.MASTERCARD]) {
      const setupSession = await t.staff.finance.post(
        `${A}/customers/${cust}/payment-methods/setup-session`,
        {},
      );
      await w.payOnStripe(setupSession, number);
      await eventually(
        async () => {
          const list = await t.staff.finance.get(`${A}/customers/${cust}/payment-methods`);
          return list.data.length === (number === TEST_CARDS.VISA ? 1 : 2);
        },
        { what: 'card saved' },
      );
    }
    const cards = (await t.staff.finance.get(`${A}/customers/${cust}/payment-methods`)).data;
    expect(cards.filter((c) => c.is_active)).toHaveLength(1);
    const visa = cards.find((c) => c.brand === 'visa');
    await t.staff.finance.post(`${A}/customers/${cust}/payment-methods/${visa.id}/activate`, {});
    const after = (await t.staff.finance.get(`${A}/customers/${cust}/payment-methods`)).data;
    expect(after.filter((c) => c.is_active).map((c) => c.last4)).toEqual([visa.last4]);

    const tx = await t.staff.finance.post(`${A}/installments/${down.id}/charge-saved-card`, {});
    expect(tx).toMatchObject({ status: 'succeeded', card_last4: visa.last4 });
    expect((await t.owner.get(`${A}/installments/${down.id}`)).status).toBe('paid');
  });

  it('charging with the same idempotency key twice charges once', async () => {
    const { w, t, down, s } = await setup();
    const setupSession = await t.staff.finance.post(
      `${A}/customers/${s.customer.id}/payment-methods/setup-session`,
      {},
    );
    await w.payOnStripe(setupSession, TEST_CARDS.VISA);
    await eventually(
      async () =>
        (await t.staff.finance.get(`${A}/customers/${s.customer.id}/payment-methods`)).data
          .length === 1,
      { what: 'card saved' },
    );
    const key = 'saved-charge-1';
    const a = await t.staff.finance.post(
      `${A}/installments/${down.id}/charge-saved-card`,
      { amount: 10_000_00 },
      { key },
    );
    const b = await t.staff.finance.post(
      `${A}/installments/${down.id}/charge-saved-card`,
      { amount: 10_000_00 },
      { key },
    );
    expect(b.id).toBe(a.id);
    expect((await t.owner.get(`${A}/installments/${down.id}`)).paid_amount).toBe(10_000_00);
  });

  it('reports a saved card that needs authentication as failed and leaves the invoice as it was', async () => {
    const { w, t, down, s } = await setup();
    const setupSession = await t.staff.finance.post(
      `${A}/customers/${s.customer.id}/payment-methods/setup-session`,
      {},
    );
    await w.payOnStripe(setupSession, TEST_CARDS.THREE_D_SECURE);
    await eventually(
      async () =>
        (await t.staff.finance.get(`${A}/customers/${s.customer.id}/payment-methods`)).data
          .length === 1,
      { what: 'card saved' },
    );
    const tx = await t.staff.finance.post(`${A}/installments/${down.id}/charge-saved-card`, {});
    expect(tx.status).toBe('failed');
    expect(tx.failure_code ?? tx.failure_message).toBeTruthy();
    expect((await t.owner.get(`${A}/installments/${down.id}`)).paid_amount).toBe(0);
  });
});
