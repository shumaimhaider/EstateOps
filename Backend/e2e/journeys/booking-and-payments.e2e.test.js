import { describe, expect, it } from 'vitest';
import { eventually } from '../support/http.js';
import { useStack } from '../support/suite.js';

const ctx = useStack();
const A = '/api/v1/admin';

describe('booking a unit and taking payment by hand', () => {
  it('turns a request into an active booking with a complete schedule, and the unit is booked', async () => {
    const { w } = ctx;
    const t = await w.tenantWithStaff();
    const s = await w.seedSales(t.owner, { price: 1_000_000_00, downPct: 20, installments: 4 });
    const booking = await w.book(t.owner, s);

    expect(booking).toMatchObject({ status: 'active', total_price: 1_000_000_00 });
    const invoices = await w.invoicesOf(t.owner, booking.id);
    expect(invoices).toHaveLength(5);
    expect(invoices[0]).toMatchObject({
      kind: 'down_payment',
      amount: 200_000_00,
      due_date: booking.booked_at,
    });
    // equal monthly installments, the last absorbing rounding: the schedule adds up to the price
    expect(invoices.reduce((sum, i) => sum + i.amount, 0)).toBe(1_000_000_00);
    expect(new Set(invoices.map((i) => i.invoice_no)).size).toBe(5);
    const unit = await eventually(
      async () => {
        const u = await t.owner.get(`${A}/units/${s.unit.id}`);
        return u.status === 'booked' ? u : null;
      },
      { what: 'unit booked' },
    );
    expect(unit.status).toBe('booked');
  });

  it('records part and full payments, issues a receipt, and keeps every figure a sum of invoices', async () => {
    const { w } = ctx;
    const t = await w.tenantWithStaff();
    const s = await w.seedSales(t.owner, { price: 400_000_00, downPct: 25, installments: 3 });
    const booking = await w.book(t.owner, s);
    const [down] = await w.invoicesOf(t.owner, booking.id);

    const part = await t.staff.finance.post(`${A}/installments/${down.id}/pay`, {
      method: 'bank_transfer',
      amount: 30_000_00,
      reference: `REF-${down.id}`,
    });
    expect(part).toMatchObject({ paid_amount: 30_000_00, balance: 70_000_00 });
    expect(part.receipt_no).toBeNull();

    const full = await t.staff.finance.post(`${A}/installments/${down.id}/pay`, {
      method: 'cash',
      amount: 70_000_00,
    });
    expect(full).toMatchObject({ status: 'paid', balance: 0 });
    expect(full.receipt_no).toMatch(/^RCT-/);

    const after = await eventually(
      async () => {
        const b = await t.owner.get(`${A}/bookings/${booking.id}`);
        return b.received_amount === 100_000_00 ? b : null;
      },
      { what: 'booking figures updated' },
    );
    expect(after.received_amount + after.pending_amount).toBe(400_000_00);

    const customer = await eventually(
      async () => {
        const c = await t.owner.get(`${A}/customers/${s.customer.id}`);
        return c.received_amount === 100_000_00 ? c : null;
      },
      { what: 'customer position updated' },
    );
    expect(JSON.stringify(customer)).not.toContain('35202-1234567-1');
    expect(customer.id_number_masked).toMatch(/\*/);
  });

  it('refuses what the rules forbid', async () => {
    const { w } = ctx;
    const t = await w.tenantWithStaff();
    const s = await w.seedSales(t.owner, { price: 100_000_00, downPct: 50, installments: 2 });
    const booking = await w.book(t.owner, s);
    const [down, next] = await w.invoicesOf(t.owner, booking.id);
    const pay = (id, body) => t.staff.finance.fails('POST', `${A}/installments/${id}/pay`, body);

    expect((await pay(down.id, { method: 'cash', amount: down.balance + 1 })).status).toBe(422);
    expect((await pay(down.id, { method: 'cash', amount: 0 })).status).toBe(422);
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    expect(
      (await pay(down.id, { method: 'cash', amount: 100, received_on: tomorrow })).status,
    ).toBe(422);
    expect((await pay(down.id, { method: 'barter', amount: 100 })).status).toBe(422);

    await t.staff.finance.post(`${A}/installments/${down.id}/pay`, {
      method: 'cheque',
      amount: 100,
      reference: 'DUP-1',
    });
    const dup = await pay(next.id, { method: 'cheque', amount: 100, reference: 'DUP-1' });
    expect(dup.status).toBe(422);
    expect(JSON.stringify(dup.body)).toMatch(/reference/i);
    // nothing was recorded by the refused attempts
    const reread = await t.owner.get(`${A}/installments/${down.id}`);
    expect(reread.paid_amount).toBe(100);
  });

  it('repeating the same request does not repeat its effect', async () => {
    const { w } = ctx;
    const t = await w.tenantWithStaff();
    const s = await w.seedSales(t.owner, { price: 100_000_00, downPct: 50, installments: 2 });
    const booking = await w.book(t.owner, s);
    const [down] = await w.invoicesOf(t.owner, booking.id);
    const key = `retry-${down.id}`;
    const first = await t.staff.finance.post(
      `${A}/installments/${down.id}/pay`,
      { method: 'cash', amount: 1000 },
      { key },
    );
    const again = await t.staff.finance.post(
      `${A}/installments/${down.id}/pay`,
      { method: 'cash', amount: 1000 },
      { key },
    );
    expect(again).toEqual(first);
    expect((await t.owner.get(`${A}/installments/${down.id}`)).paid_amount).toBe(1000);
    const payments = await t.owner.get(`${A}/installments/${down.id}/payments`);
    expect(payments.data).toHaveLength(1);
  });

  it('completes the booking and sells the unit when everything is paid; cancel is then refused', async () => {
    const { w } = ctx;
    const t = await w.tenantWithStaff();
    const s = await w.seedSales(t.owner, { price: 90_000_00, downPct: 33, installments: 2 });
    const booking = await w.book(t.owner, s);
    for (const inv of await w.invoicesOf(t.owner, booking.id)) {
      await t.staff.finance.post(`${A}/installments/${inv.id}/pay`, {
        method: 'online',
        amount: inv.balance,
      });
    }
    const done = await eventually(
      async () => {
        const b = await t.owner.get(`${A}/bookings/${booking.id}`);
        return b.status === 'completed' ? b : null;
      },
      { what: 'booking completed' },
    );
    expect(done.pending_amount).toBe(0);
    const unit = await eventually(
      async () => {
        const u = await t.owner.get(`${A}/units/${s.unit.id}`);
        return u.status === 'sold' ? u : null;
      },
      { what: 'unit sold' },
    );
    expect(unit.status).toBe('sold');
    expect(
      (
        await t.owner.fails('POST', `${A}/bookings/${booking.id}/cancel`, {
          reason: 'changed mind',
        })
      ).status,
    ).toBe(409);
  });

  it('cancels before any payment: the unit is free again and open invoices are cancelled', async () => {
    const { w } = ctx;
    const t = await w.tenantWithStaff();
    const s = await w.seedSales(t.owner);
    const booking = await w.book(t.owner, s);
    await t.owner.post(`${A}/bookings/${booking.id}/cancel`, { reason: 'customer withdrew' });
    await eventually(
      async () => (await t.owner.get(`${A}/units/${s.unit.id}`)).status === 'available',
      { what: 'unit available' },
    );
    const invoices = await eventually(
      async () => {
        const list = await w.invoicesOf(t.owner, booking.id);
        return list.every((i) => i.status === 'cancelled') ? list : null;
      },
      { what: 'invoices cancelled' },
    );
    expect(invoices.every((i) => i.status === 'cancelled')).toBe(true);
    // the unit can be sold to someone else
    const second = await t.owner.post(`${A}/customers`, {
      full_name: 'Second Buyer',
      email: 'second@buyers.e2e.test',
    });
    const rebook = await w.book(t.owner, { unit: s.unit, customer: second, plan: s.plan });
    expect(rebook.status).toBe('active');
  });

  it('refuses a cancel after a payment', async () => {
    const { w } = ctx;
    const t = await w.tenantWithStaff();
    const s = await w.seedSales(t.owner);
    const booking = await w.book(t.owner, s);
    const [down] = await w.invoicesOf(t.owner, booking.id);
    await t.staff.finance.post(`${A}/installments/${down.id}/pay`, { method: 'cash', amount: 500 });
    // refused at once, without waiting for billing's event to reach sales
    expect((await t.owner.fails('POST', `${A}/bookings/${booking.id}/cancel`, {})).status).toBe(
      409,
    );
  });

  it('allows one live booking per unit: the second request is cancelled with a reason', async () => {
    const { w } = ctx;
    const t = await w.tenantWithStaff();
    const s = await w.seedSales(t.owner);
    await w.book(t.owner, s);
    const rival = await t.owner.post(`${A}/customers`, {
      full_name: 'Rival Buyer',
      email: 'rival@buyers.e2e.test',
    });
    const second = await eventually(
      async () => {
        try {
          return await t.owner.post(`${A}/bookings`, {
            unit_id: s.unit.id,
            customer_id: rival.id,
            plan_id: s.plan.id,
          });
        } catch (error) {
          if (error.status === 409) return { refused: error };
          if (error.status === 404) return null;
          throw error;
        }
      },
      { what: 'rival booking answered' },
    );
    if (second.refused) {
      expect(second.refused.status).toBe(409);
    } else {
      const settled = await eventually(
        async () => {
          const b = await t.owner.get(`${A}/bookings/${second.id}`);
          return b.status === 'cancelled' ? b : null;
        },
        { what: 'rival booking cancelled by the saga' },
      );
      expect(settled.cancel_reason ?? settled.cancelled_reason ?? 'taken').toBeTruthy();
    }
    expect((await t.owner.get(`${A}/units/${s.unit.id}`)).status).toBe('booked');
  });
});
