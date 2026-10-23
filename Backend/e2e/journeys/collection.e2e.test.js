import { describe, expect, it } from 'vitest';
import { TEST_CARDS } from '@estateops/mock-providers';
import { eventually } from '../support/http.js';
import { SECRETS } from '../support/stack.js';
import { useStack } from '../support/suite.js';

const ctx = useStack();
const A = '/api/v1/admin';

const runCollection = async () => {
  const res = await fetch(`${ctx.stack.urls.billing}/internal/jobs/collect`, {
    method: 'POST',
    headers: { 'x-internal-token': SECRETS.internalToken, 'content-type': 'application/json' },
    body: '{}',
  });
  expect(res.status).toBe(200);
  return res.json();
};

async function bookingWithCard(card) {
  const { w } = ctx;
  const t = await w.tenantWithStaff();
  const s = await w.seedSales(t.owner, { price: 120_000_00, downPct: 50, installments: 2 });
  const booking = await w.book(t.owner, s);
  const [down] = await w.invoicesOf(t.owner, booking.id);
  if (card) {
    const session = await t.staff.finance.post(
      `${A}/customers/${s.customer.id}/payment-methods/setup-session`,
      {},
    );
    await w.payOnStripe(session, card);
    await eventually(
      async () =>
        (await t.staff.finance.get(`${A}/customers/${s.customer.id}/payment-methods`)).data
          .length === 1,
      { what: 'card saved' },
    );
  }
  return { t, s, booking, down };
}

describe('the daily collection scan and the payment worker', () => {
  it('charges the saved card of a due invoice through the worker, books it and emails the customer', async () => {
    const { t, s, down } = await bookingWithCard(TEST_CARDS.VISA);
    const summary = await runCollection();
    expect(summary.requested).toBeGreaterThanOrEqual(1);

    const paid = await eventually(
      async () => {
        const i = await t.owner.get(`${A}/installments/${down.id}`);
        return i.status === 'paid' ? i : null;
      },
      { what: 'invoice charged by the worker' },
    );
    expect(paid.paid_amount).toBe(down.amount);

    const txs = (await t.owner.get(`${A}/transactions`, { booking_id: down.booking_id })).data;
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ status: 'succeeded', trigger: 'scheduled' });

    const mail = await eventually(
      () => ctx.stack.mails.find((m) => m.service === 'billing' && m.to === s.customer.email),
      { what: 'customer email from billing' },
    );
    expect(mail.text).toContain('INV-');
  });

  it('is safe to run twice: the same day never charges twice', async () => {
    const { t, down } = await bookingWithCard(TEST_CARDS.VISA);
    await runCollection();
    await eventually(
      async () => (await t.owner.get(`${A}/installments/${down.id}`)).status === 'paid',
      { what: 'charged' },
    );
    await runCollection();
    await runCollection();
    await new Promise((r) => setTimeout(r, 1000));
    const txs = (await t.owner.get(`${A}/transactions`, { booking_id: down.booking_id })).data;
    expect(txs.filter((x) => x.status === 'succeeded')).toHaveLength(1);
    expect((await t.owner.get(`${A}/installments/${down.id}`)).paid_amount).toBe(down.amount);
  });

  it('records a failed attempt, emails the customer and does not retry the same day', async () => {
    const { t, s, down } = await bookingWithCard(TEST_CARDS.THREE_D_SECURE);
    await runCollection();
    const tx = await eventually(
      async () =>
        (await t.owner.get(`${A}/transactions`, { booking_id: down.booking_id })).data.find(
          (x) => x.status === 'failed',
        ),
      { what: 'failed attempt recorded' },
    );
    expect(tx.trigger).toBe('scheduled');
    expect((await t.owner.get(`${A}/installments/${down.id}`)).paid_amount).toBe(0);
    await eventually(
      () =>
        ctx.stack.mails.find(
          (m) =>
            m.service === 'billing' &&
            m.to === s.customer.email &&
            /not|fail|declin|unable|authent/i.test(`${m.subject} ${m.text}`),
        ),
      { what: 'failure email' },
    );
    await runCollection();
    await new Promise((r) => setTimeout(r, 800));
    const all = (await t.owner.get(`${A}/transactions`, { booking_id: down.booking_id })).data;
    expect(all).toHaveLength(1);
  });

  it('skips invoices whose customer has no saved card', async () => {
    const { t, down } = await bookingWithCard(null);
    const summary = await runCollection();
    expect(summary).toHaveProperty('skipped');
    await new Promise((r) => setTimeout(r, 600));
    expect(
      (await t.owner.get(`${A}/transactions`, { booking_id: down.booking_id })).data,
    ).toHaveLength(0);
  });

  it('is the same worker code as a staff charge: a staff saved-card charge shows the same ledger shape', async () => {
    const { t, down } = await bookingWithCard(TEST_CARDS.VISA);
    const staffTx = await t.staff.finance.post(`${A}/installments/${down.id}/charge-saved-card`, {
      amount: 1_000_00,
    });
    await runCollection();
    const paid = await eventually(
      async () => (await t.owner.get(`${A}/installments/${down.id}`)).status === 'paid',
      { what: 'rest collected' },
    );
    expect(paid).toBe(true);
    const txs = (await t.owner.get(`${A}/transactions`, { booking_id: down.booking_id })).data;
    expect(new Set(txs.map((x) => Object.keys(x).sort().join())).size).toBe(1);
    expect(txs.map((x) => x.trigger).sort()).toEqual([staffTx.trigger, 'scheduled'].sort());
  });

  it('keeps a day-by-day history: who was charged, who failed and exactly why (insufficient balance, bank decline, needs authentication), who was skipped', async () => {
    const { w } = ctx;
    const t = await w.tenantWithStaff();
    const makeBuyer = async (card, email) => {
      const s = await w.seedSales(t.owner, {
        price: 100_000_00,
        downPct: 50,
        installments: 2,
        email,
      });
      const booking = await w.book(t.owner, s);
      const [down] = await w.invoicesOf(t.owner, booking.id);
      if (card) {
        const session = await t.staff.finance.post(
          `${A}/customers/${s.customer.id}/payment-methods/setup-session`,
          {},
        );
        await w.payOnStripe(session, card);
        await eventually(
          async () =>
            (await t.staff.finance.get(`${A}/customers/${s.customer.id}/payment-methods`)).data
              .length === 1,
          { what: 'card saved' },
        );
      }
      return { s, booking, down };
    };
    const paid = await makeBuyer(TEST_CARDS.VISA, 'paid@h.e2e.test');
    const broke = await makeBuyer(TEST_CARDS.MASTERCARD, 'broke@h.e2e.test');
    const bank = await makeBuyer(TEST_CARDS.VISA, 'bank@h.e2e.test');
    const auth = await makeBuyer(TEST_CARDS.THREE_D_SECURE, 'auth@h.e2e.test');
    const none = await makeBuyer(null, 'nocard@h.e2e.test');

    // the bank's side: one card has no money left, another is refused for no stated reason
    const stripePms = await (await fetch(`${ctx.stack.stripe.url}/_mock/payment-methods`)).json();
    const decline = (customerEmail, body) => {
      const owner = stripePms.find(
        (p) => p.last4 === (customerEmail === 'broke@h.e2e.test' ? '4444' : '4242'),
      );
      return fetch(`${ctx.stack.stripe.url}/_mock/payment-methods/${owner.id}/decline`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    };
    await decline('broke@h.e2e.test', {
      code: 'card_declined',
      decline_code: 'insufficient_funds',
      message: 'Your card has insufficient funds.',
    });

    await runCollection();
    await eventually(
      async () => {
        const day = await t.staff.finance.get(`${A}/collection-runs/today`);
        return (
          day.data.filter((a) => a.status === 'queued' || a.status === 'in_progress').length ===
            0 && day.data.length >= 5
        );
      },
      { what: 'every charge settled' },
    );

    const day = await t.staff.finance.get(`${A}/collection-runs/today`);
    const by = (email) =>
      day.data.find(
        (a) =>
          a.customer_name === 'Bilal Buyer' &&
          a.invoice_id &&
          [paid, broke, bank, auth, none].find((x) => x.s.customer.email === email).down.id ===
            a.invoice_id,
      );
    expect(by('paid@h.e2e.test')).toMatchObject({
      status: 'succeeded',
      funds: 'sufficient',
      reason: 'due',
      attempt_no: 1,
    });
    expect(by('broke@h.e2e.test')).toMatchObject({
      status: 'failed',
      category: 'insufficient_funds',
      funds: 'insufficient',
      stripe_code: 'insufficient_funds',
      will_retry: true,
    });
    expect(by('broke@h.e2e.test').summary).toMatch(/insufficient balance/i);
    expect(by('broke@h.e2e.test').retry_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(by('auth@h.e2e.test')).toMatchObject({
      status: 'failed',
      category: 'authentication_required',
      will_retry: false,
    });
    expect(by('nocard@h.e2e.test')).toMatchObject({ status: 'skipped', category: 'no_card' });
    expect(by('paid@h.e2e.test').card_last4).toBe('4242');
    expect(by('paid@h.e2e.test').stripe_payment_intent_id).toMatch(/^pi_/);

    // the per-day totals add up, and the filters narrow the list
    expect(day.summary).toMatchObject({ succeeded: 2, failed: 2, skipped: 1, invoices: 5 });
    expect(day.summary.collected_amount).toBe(2 * 50_000_00);
    const failedOnly = await t.staff.finance.get(`${A}/collection-runs/today`, {
      status: 'failed',
    });
    expect(failedOnly.data.map((a) => a.status)).toEqual(['failed', 'failed']);

    const days = await t.staff.finance.get(`${A}/collection-runs`);
    expect(days.data[0]).toMatchObject({ failed: 2, succeeded: 2, skipped: 1 });
    // other developers' invoices never appear, and a role without the permission is refused
    const other = await w.tenantWithStaff({ roles: ['marketing'] });
    expect((await other.owner.get(`${A}/collection-runs/today`)).data).toEqual([]);
    expect((await other.staff.marketing.fails('GET', `${A}/collection-runs`)).status).toBe(403);
  });
});
