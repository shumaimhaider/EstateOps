import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EntitySchema } from 'typeorm';
import { EVENT, buildEvent } from '@estateops/contracts';
import { newId } from '@estateops/kernel';
import {
  createDataSource,
  createIdempotencyStore,
  createOutboxStore,
  createRelay,
  createQuery,
  createTypeormUow,
  connect,
  isRetryable,
  withRetry,
  keysetPage,
  keysetSql,
  likeContains,
  pgCode,
  silentLogger,
  table,
} from '../src/index.js';
import { TEST_TENANT_A, createTestDatabase, postgresAvailable } from '../src/testing/index.js';

const available = await postgresAvailable();
if (!available) process.stderr.write('[platform db tests] no PostgreSQL reachable: skipping\n');

const ProjectRow = new EntitySchema({
  name: 'ProjectRow',
  tableName: 'project',
  schema: 'inventory',
  columns: {
    id: { type: 'uuid', primary: true },
    tenant_id: { type: 'uuid' },
    name: { type: 'text' },
    kind: { type: 'text' },
  },
});

describe.skipIf(!available)('platform on PostgreSQL', () => {
  let db;
  let ds;
  const uow = () =>
    createTypeormUow({
      dataSource: ds,
      schema: 'inventory',
      buildRepos: (manager) => ({ projects: { manager } }),
    });
  const insertProject = (name, tenantId = TEST_TENANT_A) =>
    ds.query(
      `INSERT INTO inventory.project (id, tenant_id, name, kind) VALUES ($1, $2, $3, 'tower')`,
      [newId(), tenantId, name],
    );
  const event = () =>
    buildEvent({
      type: EVENT.PROJECT_UPSERTED,
      tenantId: TEST_TENANT_A,
      producer: 'inventory',
      data: { project_id: newId(), name: 'P', kind: 'tower' },
    });

  beforeAll(async () => {
    db = await createTestDatabase();
    ds = await connect(createDataSource({ url: db.url, entities: [ProjectRow], poolSize: 5 }));
  });
  afterAll(async () => {
    await ds?.destroy();
    await db?.drop();
  });

  it('loads the schema with the permission catalogue', async () => {
    const [{ count }] = await ds.query('SELECT count(*)::int AS count FROM identity.permission');
    expect(count).toBe(18);
    const schemas = await ds.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('identity','inventory','customer','sales','billing','contract')`,
    );
    expect(schemas).toHaveLength(6);
  });

  describe('unit of work', () => {
    it('commits the row, its audit entry and its outbox event together', async () => {
      const id = newId();
      const e = event();
      await uow().run(async (repos) => {
        await repos.projects.manager.query(
          `INSERT INTO inventory.project (id, tenant_id, name, kind) VALUES ($1, $2, 'Committed', 'tower')`,
          [id, TEST_TENANT_A],
        );
        await repos.audit.record({
          tenantId: TEST_TENANT_A,
          actor: { userId: newId(), name: 'Sam' },
          action: 'project.create',
          subjectType: 'project',
          subjectId: id,
          after: { name: 'Committed' },
        });
        await repos.outbox.add(e);
      });
      expect(await ds.query('SELECT 1 FROM inventory.project WHERE id = $1', [id])).toHaveLength(1);
      expect(
        await ds.query(`SELECT 1 FROM inventory.audit_log WHERE subject_id = $1`, [id]),
      ).toHaveLength(1);
      const [row] = await ds.query('SELECT status, payload FROM inventory.outbox WHERE id = $1', [
        e.id,
      ]);
      expect(row.status).toBe('pending');
      expect(row.payload.type).toBe(EVENT.PROJECT_UPSERTED);
    });

    it('rolls everything back when the work throws', async () => {
      const id = newId();
      const e = event();
      await expect(
        uow().run(async (repos) => {
          await repos.projects.manager.query(
            `INSERT INTO inventory.project (id, tenant_id, name, kind) VALUES ($1, $2, 'Doomed', 'tower')`,
            [id, TEST_TENANT_A],
          );
          await repos.audit.record({
            tenantId: TEST_TENANT_A,
            action: 'x',
            subjectType: 'project',
            subjectId: id,
          });
          await repos.outbox.add(e);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await ds.query('SELECT 1 FROM inventory.project WHERE id = $1', [id])).toHaveLength(0);
      expect(
        await ds.query('SELECT 1 FROM inventory.audit_log WHERE subject_id = $1', [id]),
      ).toHaveLength(0);
      expect(await ds.query('SELECT 1 FROM inventory.outbox WHERE id = $1', [e.id])).toHaveLength(
        0,
      );
    });

    it('exposes database constraint codes for translation', async () => {
      await insertProject('Unique One');
      const error = await insertProject('unique one').catch((e) => e);
      expect(pgCode(error)).toBe('23505');
    });

    it('marks an event processed once, so a redelivery is a no-op', async () => {
      const id = newId();
      const first = await uow().run((r) => r.processedEvents.markProcessed(id));
      const second = await uow().run((r) => r.processedEvents.markProcessed(id));
      expect([first, second]).toEqual([true, false]);
    });

    it('keeps the audit log append-only', async () => {
      await uow().run((r) =>
        r.audit.record({ tenantId: TEST_TENANT_A, action: 'a', subjectType: 's', subjectId: 'z' }),
      );
      await expect(ds.query(`UPDATE inventory.audit_log SET action = 'tampered'`)).rejects.toThrow(
        /append-only/,
      );
      await expect(ds.query('DELETE FROM inventory.audit_log')).rejects.toThrow(/append-only/);
    });
  });

  describe('outbox', () => {
    const store = () => createOutboxStore(ds, { schema: 'inventory' });
    const seed = async (n) => {
      await ds.query('DELETE FROM inventory.outbox');
      for (let i = 0; i < n; i += 1) await uow().run((r) => r.outbox.add(event()));
    };

    it('leases a batch so nobody else gets it, and a failed row becomes claimable after its backoff', async () => {
      await seed(3);
      const claimed = await store().claim(10);
      expect(claimed).toHaveLength(3);
      expect(await store().claim(10)).toHaveLength(0);

      await store().markFailed(claimed[0].id, {
        deliveredTo: ['billing'],
        attempts: 1,
        nextAttemptAt: new Date(Date.now() - 1000),
        error: 'x',
        dead: false,
      });
      const again = await store().claim(10);
      expect(again).toHaveLength(1);
      expect(again[0]).toMatchObject({ id: claimed[0].id, attempts: 1, deliveredTo: ['billing'] });
    });

    it('never hands the same row to two concurrent relays (SKIP LOCKED)', async () => {
      await seed(20);
      const [a, b] = await Promise.all([store().claim(12), store().claim(12)]);
      const ids = [...a, ...b].map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toHaveLength(20);
    });

    it('moves rows to published or dead', async () => {
      await seed(2);
      const [one, two] = await store().claim(10);
      await store().markPublished(one.id, ['billing']);
      await store().markFailed(two.id, {
        deliveredTo: [],
        attempts: 10,
        nextAttemptAt: new Date(),
        error: 'gave up',
        dead: true,
      });
      const rows = await ds.query(
        'SELECT status, last_error FROM inventory.outbox ORDER BY status',
      );
      expect(rows.map((r) => r.status).sort()).toEqual(['dead', 'published']);
      expect(rows.find((r) => r.status === 'dead').last_error).toBe('gave up');
    });

    it('drives the relay end to end against the real store', async () => {
      await seed(2);
      const sent = [];
      const relay = createRelay({
        store: store(),
        subscribers: {
          billing: 'http://billing',
          sales: 'http://sales',
          inventory: 'http://inventory',
        },
        internalToken: 't',
        logger: silentLogger,
        fetchImpl: async (url) => (sent.push(url), { ok: true, status: 200 }),
      });
      expect(await relay.tick()).toEqual({ published: 2, retry: 0, dead: 0 });
      // each event goes to the services that consume it: billing, and inventory (its own cache)
      expect(sent.sort()).toEqual([
        'http://billing/internal/events',
        'http://billing/internal/events',
        'http://inventory/internal/events',
        'http://inventory/internal/events',
      ]);
      expect(
        await ds.query(`SELECT 1 FROM inventory.outbox WHERE status = 'pending'`),
      ).toHaveLength(0);
    });
  });

  describe('idempotency store', () => {
    it('round-trips a response, keeps tenants apart and purges old keys', async () => {
      const store = createIdempotencyStore(ds, { schema: 'inventory' });
      const key = { tenantId: TEST_TENANT_A, key: 'k', route: 'POST /x' };
      expect(await store.find(key.tenantId, key.key, key.route)).toBeNull();
      await store.save({ ...key, requestHash: 'h', status: 201, body: { id: 1 } });
      await store.save({ ...key, requestHash: 'other', status: 500, body: {} }); // ignored: first write wins
      expect(await store.find(key.tenantId, key.key, key.route)).toEqual({
        requestHash: 'h',
        status: 201,
        body: { id: 1 },
      });
      expect(
        await store.find('00000000-0000-4000-8000-0000000000b2', key.key, key.route),
      ).toBeNull();
      await ds.query(
        `UPDATE inventory.idempotency_key SET created_at = now() - interval '30 days'`,
      );
      await store.purge(7);
      expect(await store.find(key.tenantId, key.key, key.route)).toBeNull();
    });
  });

  describe('keyset pagination', () => {
    beforeAll(async () => {
      await ds.query('DELETE FROM inventory.project');
      for (let i = 0; i < 25; i += 1)
        await insertProject(`Project ${String(i % 7).padStart(2, '0')} #${i}`);
      // identical names across tenants must not leak or break ordering
      await insertProject('Project 00 #other', '00000000-0000-4000-8000-0000000000b2');
    });

    const collect = async (dir, limit) => {
      const names = [];
      let cursor = null;
      let pages = 0;
      do {
        const qb = ds
          .getRepository(ProjectRow)
          .createQueryBuilder('p')
          .where('p.tenant_id = :t', { t: TEST_TENANT_A });
        const page = await keysetPage({
          qb,
          sort: { expr: 'lower(p.name)', dir, cast: 'text' },
          idExpr: 'p.id',
          cursor,
          limit,
          valueOf: (row) => row.name.toLowerCase(),
          idOf: (row) => row.id,
        });
        names.push(...page.rows.map((r) => r.name));
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor);
      return { names, pages };
    };

    it('walks every row exactly once in ascending order', async () => {
      const { names, pages } = await collect('asc', 10);
      expect(names).toHaveLength(25);
      expect(new Set(names).size).toBe(25);
      expect(pages).toBe(3);
      expect(names.map((n) => n.toLowerCase())).toEqual(
        [...names.map((n) => n.toLowerCase())].sort(),
      );
    });

    it('walks descending too, and a page of exactly the limit has no next cursor', async () => {
      const { names } = await collect('desc', 7);
      expect(names).toHaveLength(25);
      expect(names.map((n) => n.toLowerCase())).toEqual(
        [...names.map((n) => n.toLowerCase())].sort().reverse(),
      );
      const exact = await collect('asc', 25);
      expect(exact.pages).toBe(1);
    });
  });

  describe('keysetSql with filters', () => {
    it('numbers placeholders, filters, and walks every row once in both directions', async () => {
      await ds.query('DELETE FROM inventory.project');
      for (let i = 0; i < 17; i += 1) await insertProject(`Tower ${String(i).padStart(2, '0')}`);
      await insertProject('Villa 99');
      await insertProject('Tower 00 other tenant', '00000000-0000-4000-8000-0000000000b2');

      for (const dir of ['asc', 'desc']) {
        const names = [];
        let cursor = null;
        do {
          const q = createQuery();
          q.and('p.tenant_id = ?', TEST_TENANT_A);
          q.and('p.name ILIKE ?', likeContains('tower'));
          const page = await keysetSql(ds.manager, {
            select: 'p.id, p.name',
            from: 'FROM inventory.project p',
            query: q,
            sort: { expr: 'lower(p.name)', dir, cast: 'text' },
            idExpr: 'p.id',
            cursor,
            limit: 6,
            valueOf: (r) => r.name.toLowerCase(),
            idOf: (r) => r.id,
          });
          names.push(...page.rows.map((r) => r.name));
          cursor = page.nextCursor;
        } while (cursor);
        expect(names).toHaveLength(17);
        expect(names.every((n) => n.startsWith('Tower'))).toBe(true);
        const sorted = [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        expect(names).toEqual(dir === 'asc' ? sorted : sorted.reverse());
      }
    });

    it('treats wildcards in user text literally and rejects a missing placeholder value', () => {
      expect(likeContains('50%_off')).toBe('%50\\%\\_off%');
      const q = createQuery();
      expect(() => q.and('a = ? AND b = ?', 1)).toThrow(/Missing value/);
    });
  });

  describe('retrying a deadlock', () => {
    const deadlock = () => Object.assign(new Error('deadlock detected'), { code: '40P01' });
    const quick = { sleep: async () => {} };

    it('retries a deadlock victim and gives up after the attempts, but never retries anything else', async () => {
      let calls = 0;
      const flaky = async () => {
        calls += 1;
        if (calls < 3) throw deadlock();
        return 'ok';
      };
      expect(await withRetry(flaky, quick)).toBe('ok');
      expect(calls).toBe(3);

      calls = 0;
      const always = async () => {
        calls += 1;
        throw deadlock();
      };
      await expect(withRetry(always, { ...quick, attempts: 2 })).rejects.toMatchObject({
        code: '40P01',
      });
      expect(calls).toBe(2);

      calls = 0;
      const broken = async () => {
        calls += 1;
        throw new Error('boom');
      };
      await expect(withRetry(broken, quick)).rejects.toThrow('boom');
      expect(calls).toBe(1);
      expect(isRetryable({ driverError: { code: '40001' } })).toBe(true);
      expect(isRetryable({ code: '23505' })).toBe(false);
    });

    it('recovers a real deadlock between two transactions locking rows in opposite order', async () => {
      const [a, b] = [newId(), newId()];
      await ds.query(
        `INSERT INTO inventory.project (id, tenant_id, name, kind) VALUES ($1, $2, 'DL-A', 'tower'), ($3, $2, 'DL-B', 'tower')`,
        [a, TEST_TENANT_A, b],
      );
      const lockBoth = (first, second) =>
        uow().run(async ({ projects }) => {
          await projects.manager.query('SELECT 1 FROM inventory.project WHERE id = $1 FOR UPDATE', [
            first,
          ]);
          await new Promise((resolve) => setTimeout(resolve, 150)); // let the other transaction take its first row
          await projects.manager.query('SELECT 1 FROM inventory.project WHERE id = $1 FOR UPDATE', [
            second,
          ]);
          return 'done';
        });
      expect(await Promise.all([lockBoth(a, b), lockBoth(b, a)])).toEqual(['done', 'done']);
    });
  });

  it('refuses unsafe identifiers in raw SQL helpers', () => {
    expect(table('billing', 'outbox')).toBe('"billing"."outbox"');
    expect(() => table('billing; drop table x', 'outbox')).toThrow(/Unsafe/);
  });
});
