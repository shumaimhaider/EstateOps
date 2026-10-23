import { describe, expect, it } from 'vitest';
import { eventually } from '../support/http.js';
import { useStack } from '../support/suite.js';

const ctx = useStack();
const A = '/api/v1/admin';

/** A booking made 130 days ago, so its down payment and first installments are already late. */
async function lateBooking({ installments = 6 } = {}) {
  const { w } = ctx;
  const t = await w.tenantWithStaff();
  const s = await w.seedSales(t.owner, { price: 600_000_00, downPct: 20, installments });
  const booking = await w.book(t.owner, s, { bookedAt: w.daysAgo(130) });
  await w.sweep();
  const invoices = await w.invoicesOf(t.owner, booking.id);
  return { w, t, s, booking, invoices };
}

describe('late payments, fines and escalations', () => {
  it('moves unpaid invoices to due then overdue by the dates, and never touches paid ones', async () => {
    const { t, w, booking, invoices } = await lateBooking();
    const statuses = invoices.map((i) => i.status);
    expect(statuses[0]).toBe('overdue');
    expect(statuses.at(-1)).toBe('scheduled');
    await t.staff.finance.post(`${A}/installments/${invoices[0].id}/pay`, {
      method: 'cash',
      amount: invoices[0].balance,
    });
    await w.sweep();
    const after = await w.invoicesOf(t.owner, booking.id);
    expect(after[0].status).toBe('paid');
  });

  it('charges the default fine on overdue installments and reprices when the rate changes', async () => {
    const { t, booking, invoices } = await lateBooking();
    const overdue = invoices.find((i) => i.status === 'overdue');
    // 2% to start
    expect(overdue.fine_amount).toBe(Math.floor((overdue.amount * 2) / 100));
    await t.staff.finance.put(`${A}/fine-rules`, { scope: 'default', kind: 'percent', value: 500 });
    const repriced = await eventually(
      async () => {
        const list = await ctx.w.invoicesOf(t.owner, booking.id);
        const first = list.find((i) => i.id === overdue.id);
        return first.fine_amount === Math.floor((overdue.amount * 5) / 100) ? first : null;
      },
      { what: 'fines repriced to 5%' },
    );
    expect(repriced.fine_amount).toBeGreaterThan(overdue.fine_amount);
    // a category rate beats the default; removing it falls back again
    const plot = await t.staff.finance.put(`${A}/fine-rules`, {
      scope: 'default',
      unit_kind: 'plot',
      kind: 'fixed',
      value: 1_000_00,
    });
    await eventually(
      async () =>
        (await ctx.w.invoicesOf(t.owner, booking.id)).find((i) => i.id === overdue.id)
          .fine_amount === 1_000_00,
      { what: 'plot rate applied' },
    );
    await t.staff.finance.delete(`${A}/fine-rules/${plot.id}`);
    await eventually(
      async () =>
        (await ctx.w.invoicesOf(t.owner, booking.id)).find((i) => i.id === overdue.id)
          .fine_amount === Math.floor((overdue.amount * 5) / 100),
      { what: 'back to default' },
    );
  });

  it('never removes the default rate, and a sales agent cannot change rates', async () => {
    const { t } = await lateBooking();
    const rules = (await t.staff.finance.get(`${A}/fine-rules`)).data;
    const def = rules.find((r) => r.scope === 'default' && !r.unit_kind);
    expect(
      (await t.staff.finance.fails('DELETE', `${A}/fine-rules/${def.id}`)).status,
    ).toBeGreaterThanOrEqual(400);
    expect(
      (
        await t.staff.sales_agent.fails('PUT', `${A}/fine-rules`, {
          scope: 'default',
          kind: 'percent',
          value: 100,
        })
      ).status,
    ).toBe(403);
  });

  it('lists a booking with three or more overdue installments as an escalated case, sends one notice, and resolves when paid down', async () => {
    const { t, booking, invoices } = await lateBooking();
    const overdue = invoices.filter((i) => i.status === 'overdue');
    expect(overdue.length).toBeGreaterThanOrEqual(3);
    const cases = await eventually(
      async () => {
        const c = (await t.owner.get(`${A}/escalations`)).data.filter(
          (e) => e.booking_id === booking.id,
        );
        return c.length ? c : null;
      },
      { what: 'escalated case' },
    );
    expect(cases[0].missed_installments).toBe(overdue.length);

    const noticed = await t.staff.finance.post(`${A}/escalations/${booking.id}/notice`, {});
    expect(noticed.notice_sent_at).toBeTruthy();
    expect(
      (await t.staff.finance.fails('POST', `${A}/escalations/${booking.id}/notice`, {})).status,
    ).toBe(409);

    for (const inv of overdue.slice(0, overdue.length - 2)) {
      await t.staff.finance.post(`${A}/installments/${inv.id}/pay`, {
        method: 'cash',
        amount: inv.balance,
      });
    }
    await eventually(
      async () =>
        (await t.owner.get(`${A}/escalations`)).data.every((e) => e.booking_id !== booking.id),
      { what: 'case resolved' },
    );
  });

  it('shows collection figures that equal the sum of the invoices', async () => {
    const { t, invoices } = await lateBooking();
    const stats = await t.owner.get(`${A}/stats/collections`);
    const sum = (pick) => invoices.filter(pick).reduce((n, i) => n + i.balance, 0);
    const overdueTotal = sum((i) => i.status === 'overdue');
    expect(JSON.stringify(stats)).toContain(String(overdueTotal));
  });
});
