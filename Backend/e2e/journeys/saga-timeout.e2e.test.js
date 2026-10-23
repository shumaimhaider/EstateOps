import { describe, expect, it } from 'vitest';
import { eventually } from '../support/http.js';
import { useStack } from '../support/suite.js';

const ctx = useStack({ serviceEnv: { sales: { SAGA_TIMEOUT_MS: '4000', SAGA_SWEEP_MS: '500' } } });
const A = '/api/v1/admin';

describe('a booking that cannot finish is rolled back (compensation)', () => {
  it('billing never answers: the booking is aborted, the unit is freed and the customer can try again', async () => {
    const { w, stack } = ctx;
    const t = await w.tenantWithStaff();
    const s = await w.seedSales(t.owner);
    await w.book(t.owner, await w.seedSales(t.owner)); // reference data has settled everywhere
    await new Promise((r) => setTimeout(r, 500));

    await stack.kill('billing');
    const booking = await eventually(
      async () => {
        try {
          return await t.owner.post(`${A}/bookings`, {
            unit_id: s.unit.id,
            customer_id: s.customer.id,
            plan_id: s.plan.id,
          });
        } catch (e) {
          if ([404, 409, 422].includes(e.status)) return null;
          throw e;
        }
      },
      { what: 'accepted' },
    );

    const aborted = await eventually(
      async () => {
        const b = await t.owner.get(`${A}/bookings/${booking.id}`);
        return b.status === 'cancelled' ? b : null;
      },
      { what: 'booking cancelled by the saga timeout', timeoutMs: 30_000 },
    );
    expect(aborted.status).toBe('cancelled');
    await eventually(
      async () => (await t.owner.get(`${A}/units/${s.unit.id}`)).status === 'available',
      { what: 'unit released', timeoutMs: 30_000 },
    );

    // billing comes back: it must not create a schedule for the cancelled booking
    await stack.revive('billing');
    await new Promise((r) => setTimeout(r, 2500));
    const invoices = (await t.owner.get(`${A}/installments`, { booking_id: booking.id })).data;
    expect(invoices.every((i) => i.status === 'cancelled')).toBe(true);

    const retry = await w.book(t.owner, s);
    expect(retry.status).toBe('active');
  });
});
