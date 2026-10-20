import { describe, expect, it } from 'vitest';
import { server } from '@/test/mockServer.js';
import { http, HttpResponse } from 'msw';
import { createUnitsRepository } from './units.repository.js';
import { createProjectsRepository } from './projects.repository.js';
import { unitsGraphql } from './transport/units.graphql.js';
import { unitsRest } from './transport/units.rest.js';
import { projectsGraphql } from './transport/projects.graphql.js';
import { projectsRest } from './transport/projects.rest.js';

const repos = {
  rest: createUnitsRepository({
    transports: { rest: unitsRest, graphql: unitsGraphql },
    pickTransport: () => 'rest',
  }),
  graphql: createUnitsRepository({
    transports: { rest: unitsRest, graphql: unitsGraphql },
    pickTransport: () => 'graphql',
  }),
};

/** Transport parity: the same suite runs on REST and GraphQL and must yield identical models. */
describe.each(['rest', 'graphql'])('units repository over %s', (transport) => {
  const repo = repos[transport];

  it('lists a first page of unit models with a next cursor', async () => {
    const page = await repo.list({}, { limit: 10 });
    expect(page.items).toHaveLength(10);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(page.items[0]).toEqual(
      expect.objectContaining({
        unitNo: expect.any(String),
        listPrice: expect.objectContaining({ minor: expect.any(Number) }),
      }),
    );
  });

  it('filters server-side and walks all pages by cursor', async () => {
    const seen = new Set();
    let cursor;
    do {
      const page = await repo.list({ status: 'blocked', projectId: '' }, { cursor, limit: 7 });
      page.items.forEach((u) => {
        expect(u.status).toBe('blocked');
        seen.add(u.id);
      });
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen.size).toBeGreaterThan(0);
  });

  it('sorts server-side', async () => {
    const page = await repo.list({ sort: { field: 'listPrice', dir: 'desc' } }, { limit: 20 });
    const prices = page.items.map((u) => u.listPrice.minor);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
  });

  it('blocks and unblocks a unit and rejects invalid transitions with 409', async () => {
    const [available] = (await repo.list({ status: 'available' }, { limit: 1 })).items;
    expect(available.allowedActions).toContain('block');
    const blocked = await repo.block(available.id);
    expect(blocked.status).toBe('blocked');
    expect(blocked.statusHistory.at(-1).status).toBe('blocked');
    await expect(repo.block(available.id)).rejects.toMatchObject({
      status: 409,
      code: 'INVALID_TRANSITION',
    });
    expect((await repo.unblock(available.id)).status).toBe('available');
  });

  it('creates a unit and returns server validation errors keyed by form field names', async () => {
    const projects = await createProjectsRepository({
      transports: { rest: projectsRest, graphql: projectsGraphql },
      pickTransport: () => transport,
    }).list();
    const project = projects.items[0];
    const draft = {
      projectId: project.id,
      unitNo: 'ZZ-99',
      kind: 'plot',
      area: { value: 5, unit: 'marla' },
      bedrooms: null,
      facing: null,
      view: null,
      isCorner: false,
      parkingSpaces: 0,
      listPrice: { minor: 1500000000, currency: 'PKR' },
    };
    const created = await repo.create(draft);
    expect(created).toMatchObject({
      unitNo: 'ZZ-99',
      status: 'available',
      projectName: project.name,
    });
    await expect(repo.create(draft)).rejects.toMatchObject({
      status: 422,
      fieldErrors: { unitNo: expect.stringContaining('already exists') },
    });
  });

  it('replays the first response for a repeated Idempotency-Key', async () => {
    const [available] = (await repo.list({ status: 'available' }, { limit: 1 })).items;
    const first = await repo.block(available.id, { idempotencyKey: 'key-1' });
    const second = await repo.block(available.id, { idempotencyKey: 'key-1' });
    expect(second).toEqual(first);
  });
});

describe('transport parity', () => {
  it('returns identical models from REST and GraphQL', async () => {
    const args = [{ kind: 'flat', sort: { field: 'unitNo', dir: 'asc' } }, { limit: 15 }];
    const [rest, gql] = await Promise.all([repos.rest.list(...args), repos.graphql.list(...args)]);
    expect(gql).toEqual(rest);
    const id = rest.items[0].id;
    expect(await repos.graphql.get(id)).toEqual(await repos.rest.get(id));
  });
});

describe('contract drift', () => {
  it('throws a typed ContractError when the backend response no longer matches the DTO', async () => {
    server.use(
      http.get('*/api/v1/admin/units', () =>
        HttpResponse.json({ data: [{ id: 'not-a-uuid', unit_no: 5 }], next_cursor: null }),
      ),
    );
    await expect(repos.rest.list({})).rejects.toMatchObject({
      name: 'ContractError',
      code: 'CONTRACT_ERROR',
    });
  });
});
