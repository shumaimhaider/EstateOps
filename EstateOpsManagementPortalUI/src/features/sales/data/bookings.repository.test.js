import { describe, expect, it } from 'vitest';
import { getDb } from '@/test/mockServer.js';
import { createBookingsRepository } from './bookings.repository.js';
import { bookingsGraphql } from './transport/bookings.graphql.js';
import { bookingsRest } from './transport/bookings.rest.js';

const repo = (transport) =>
  createBookingsRepository({
    transports: { rest: bookingsRest, graphql: bookingsGraphql },
    pickTransport: () => transport,
  });

describe.each(['rest', 'graphql'])('bookings over %s', (transport) => {
  const bookings = repo(transport);

  it("computes each booking's EMI position from the installment register", async () => {
    const { items } = await bookings.list({ kind: 'plot' }, { limit: 30 });
    expect(items.length).toBeGreaterThan(0);
    const db = getDb();
    for (const b of items) {
      const rows = db.installments.filter((i) => i.booking_id === b.id);
      const received = rows.reduce((t, r) => t + r.paid_amount, 0);
      expect(b.unitKind).toBe('plot');
      expect(b.received.minor).toBe(received);
      expect(b.received.minor + b.pending.minor).toBe(b.totalPrice.minor);
      expect(b.installments.total).toBe(rows.length);
      expect(
        b.installments.paid + b.installments.due + b.installments.overdue + b.installments.upcoming,
      ).toBe(b.installments.total);
    }
  });

  it('filters escalated bookings and sorts by overdue amount', async () => {
    const { items } = await bookings.list(
      { escalated: true, sort: { field: 'overdue', dir: 'desc' } },
      { limit: 50 },
    );
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((b) => b.isEscalated && b.installments.overdue >= 3)).toBe(true);
    const overdue = items.map((b) => b.overdue.minor);
    expect(overdue).toEqual([...overdue].sort((a, b) => b - a));
  });

  it('gets one booking and returns 404 for another tenant', async () => {
    const [first] = (await bookings.list({}, { limit: 1 })).items;
    expect((await bookings.get(first.id)).id).toBe(first.id);
    const other = getDb().bookings.find((b) => b.tenant_id !== getDb().tenants[0].id);
    await expect(bookings.get(other.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('transport parity', () => {
  it('returns identical models', async () => {
    const f = { status: 'active', sort: { field: 'pending', dir: 'desc' } };
    expect(await repo('graphql').list(f, { limit: 15 })).toEqual(
      await repo('rest').list(f, { limit: 15 }),
    );
  });
});
