import { describe, expect, it } from 'vitest';
import { getDb } from '@/test/mockServer.js';
import { createCustomersRepository } from './customers.repository.js';
import { customersGraphql } from './transport/customers.graphql.js';
import { customersRest } from './transport/customers.rest.js';

const repo = (transport) =>
  createCustomersRepository({
    transports: { rest: customersRest, graphql: customersGraphql },
    pickTransport: () => transport,
  });

describe.each(['rest', 'graphql'])('customers over %s', (transport) => {
  const customers = repo(transport);

  it('lists customers with masked ID numbers and money roll-ups', async () => {
    const { items } = await customers.list({}, { limit: 25 });
    expect(items.length).toBe(25);
    for (const c of items) {
      expect(c.idNumberMasked).toMatch(/^\*+/);
      expect(c.idNumberMasked).not.toBe(getDb().customers.find((x) => x.id === c.id).id_number);
      expect(c.received.minor + c.pending.minor).toBe(c.totalValue.minor);
    }
  });

  it('finds by unit number and filters customers with overdue payments', async () => {
    const unit = getDb().units.find((u) => u.booking_id && u.tenant_id === getDb().tenants[0].id);
    const found = await customers.list({ search: unit.unit_no }, { limit: 50 });
    expect(found.items.some((c) => c.units.includes(unit.unit_no))).toBe(true);

    const overdue = await customers.list(
      { hasOverdue: true, sort: { field: 'overdue', dir: 'desc' } },
      { limit: 50 },
    );
    expect(overdue.items.length).toBeGreaterThan(0);
    expect(overdue.items.every((c) => c.overdue.minor > 0)).toBe(true);
  });

  it('gets one customer; another tenant is 404', async () => {
    const [first] = (await customers.list({}, { limit: 1 })).items;
    expect((await customers.get(first.id)).fullName).toBe(first.fullName);
    const other = getDb().customers.find((c) => c.tenant_id !== getDb().tenants[0].id);
    await expect(customers.get(other.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('transport parity', () => {
  it('returns identical models', async () => {
    const f = { sort: { field: 'pending', dir: 'desc' } };
    expect(await repo('graphql').list(f, { limit: 10 })).toEqual(
      await repo('rest').list(f, { limit: 10 }),
    );
  });
});
