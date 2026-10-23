import { describe, expect, it } from 'vitest';
import { eventually } from '../support/http.js';
import { useStack } from '../support/suite.js';

const ctx = useStack();
const A = '/api/v1/admin';

const request = (t, s) =>
  t.owner.post(`${A}/bookings`, {
    unit_id: s.unit.id,
    customer_id: s.customer.id,
    plan_id: s.plan.id,
  });
const statusOf = (t, id) => async () => (await t.owner.get(`${A}/bookings/${id}`)).status;
// the unit, plan and customer reach sales by events a moment after they are created
const accepted = (t, s) =>
  eventually(
    async () => {
      try {
        return await request(t, s);
      } catch (e) {
        if ([404, 409, 422].includes(e.status)) return null;
        throw e;
      }
    },
    { what: 'booking accepted' },
  );

describe('surviving a service outage (at-least-once events, nothing lost, nothing doubled)', () => {
  it('billing down while a booking is made: the schedule appears once billing is back, exactly once', async () => {
    const { w, stack } = ctx;
    const t = await w.tenantWithStaff();
    const s = await w.seedSales(t.owner, { installments: 3 });
    // let the reference data reach sales and billing before the outage
    await w.book(t.owner, await w.seedSales(t.owner));
    await new Promise((r) => setTimeout(r, 500));

    await stack.kill('billing');
    const booking = await accepted(t, s);
    await eventually(
      async () => ['confirmed', 'active'].includes(await statusOf(t, booking.id)()),
      { what: 'booking confirmed while billing is down' },
    );
    await new Promise((r) => setTimeout(r, 1500));
    expect(await statusOf(t, booking.id)()).toBe('confirmed'); // no schedule yet, so not active

    await stack.revive('billing');
    await eventually(async () => (await statusOf(t, booking.id)()) === 'active', {
      what: 'booking active after billing returned',
      timeoutMs: 40_000,
    });
    const invoices = await w.invoicesOf(t.owner, booking.id);
    expect(invoices).toHaveLength(4);
    expect(new Set(invoices.map((i) => i.invoice_no)).size).toBe(4);
  });

  it('inventory down: the booking waits, then completes when inventory returns', async () => {
    const { w, stack } = ctx;
    const t = await w.tenantWithStaff();
    const s = await w.seedSales(t.owner);
    await w.book(t.owner, await w.seedSales(t.owner));
    await new Promise((r) => setTimeout(r, 500));
    await stack.kill('inventory');
    const booking = await accepted(t, s);
    await new Promise((r) => setTimeout(r, 1500));
    expect(await statusOf(t, booking.id)()).toBe('requested');
    await stack.revive('inventory');
    await eventually(async () => (await statusOf(t, booking.id)()) === 'active', {
      what: 'booking active after inventory returned',
      timeoutMs: 40_000,
    });
    expect((await t.owner.get(`${A}/units/${s.unit.id}`)).status).toBe('booked');
  });

  it('payment recorded while sales is down still reaches the booking afterwards', async () => {
    const { w, stack } = ctx;
    const t = await w.tenantWithStaff();
    const s = await w.seedSales(t.owner);
    const booking = await w.book(t.owner, s);
    const [down] = await w.invoicesOf(t.owner, booking.id);
    await stack.kill('sales');
    await t.staff.finance.post(`${A}/installments/${down.id}/pay`, {
      method: 'cash',
      amount: 5_000_00,
    });
    await new Promise((r) => setTimeout(r, 800));
    await stack.revive('sales');
    await eventually(
      async () => (await t.owner.get(`${A}/bookings/${booking.id}`)).received_amount === 5_000_00,
      { what: 'booking figures caught up', timeoutMs: 40_000 },
    );
  });

  it('the same booking request repeated with one idempotency key makes one booking', async () => {
    const { w } = ctx;
    const t = await w.tenantWithStaff();
    const s = await w.seedSales(t.owner);
    await w.book(t.owner, await w.seedSales(t.owner));
    const key = 'one-booking-please';
    const first = await eventually(
      async () => {
        try {
          return await t.owner.post(
            `${A}/bookings`,
            { unit_id: s.unit.id, customer_id: s.customer.id, plan_id: s.plan.id },
            { key },
          );
        } catch (e) {
          if ([404, 409, 422].includes(e.status)) return null;
          throw e;
        }
      },
      { what: 'accepted' },
    );
    const again = await t.owner.post(
      `${A}/bookings`,
      { unit_id: s.unit.id, customer_id: s.customer.id, plan_id: s.plan.id },
      { key },
    );
    expect(again.id).toBe(first.id);
    const list = (await t.owner.get(`${A}/bookings`, { unit_id: s.unit.id })).data;
    expect(list).toHaveLength(1);
  });
});
