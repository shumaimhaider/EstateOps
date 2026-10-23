import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { MigrationError, computeLock, createMigrator, diffLock } from '../src/db/migrations.js';
import { MIGRATIONS_DIR, createTestDatabase, postgresAvailable } from '../src/testing/index.js';

const available = await postgresAvailable();
const REAL_LOCK = fileURLToPath(new URL('../../../db/migrations.lock.json', import.meta.url));

/** Writes a throwaway migrations tree: { scope: { '0001_name.sql': 'SQL' } }. */
async function tree(files) {
  const dir = await mkdtemp(join(tmpdir(), 'eo-mig-'));
  for (const [scope, entries] of Object.entries(files)) {
    await mkdir(join(dir, scope), { recursive: true });
    for (const [name, sql] of Object.entries(entries)) await writeFile(join(dir, scope, name), sql);
  }
  return dir;
}

describe('migration files (no database needed)', () => {
  it('loads shared migrations first, then the service, in numeric order', async () => {
    const dir = await tree({
      _shared: { '0001_base.sql': 'SELECT 1;' },
      billing: { '0002_second.sql': 'SELECT 2;', '0001_first.sql': 'SELECT 1;' },
    });
    const loaded = await createMigrator({ dir }).load('billing');
    expect(loaded.map((m) => m.id)).toEqual([
      '_shared/0001_base',
      'billing/0001_first',
      'billing/0002_second',
    ]);
    await rm(dir, { recursive: true });
  });

  it('rejects badly named files and duplicate numbers', async () => {
    const bad = await tree({ billing: { 'add_column.sql': 'SELECT 1;' } });
    await expect(createMigrator({ dir: bad }).load('billing')).rejects.toMatchObject({
      code: 'MIGRATION_BAD_NAME',
    });
    const dup = await tree({ billing: { '0001_a.sql': 'SELECT 1;', '0001_b.sql': 'SELECT 1;' } });
    await expect(createMigrator({ dir: dup }).load('billing')).rejects.toMatchObject({
      code: 'MIGRATION_DUPLICATE_NUMBER',
    });
    await expect(createMigrator({ dir: dup }).load('nosuch')).rejects.toBeInstanceOf(
      MigrationError,
    );
  });

  it('treats CRLF and LF as the same file when checksumming', async () => {
    const a = await tree({ billing: { '0001_x.sql': 'SELECT 1;\nSELECT 2;\n' } });
    const b = await tree({ billing: { '0001_x.sql': 'SELECT 1;\r\nSELECT 2;\r\n' } });
    const [x] = await createMigrator({ dir: a }).load('billing');
    const [y] = await createMigrator({ dir: b }).load('billing');
    expect(x.checksum).toBe(y.checksum);
  });

  it('flags a migration that asks to run outside a transaction', async () => {
    const dir = await tree({
      billing: {
        '0001_idx.sql': '-- migrate:no-transaction\nCREATE INDEX CONCURRENTLY i ON t (a);',
      },
    });
    const [m] = await createMigrator({ dir }).load('billing');
    expect(m.transactional).toBe(false);
  });

  it('keeps every real migration locked: applied files may never change or disappear', async () => {
    const locked = JSON.parse(await readFile(REAL_LOCK, 'utf8'));
    const { changed, removed, unlocked } = diffLock(locked, await computeLock(MIGRATIONS_DIR));
    expect({ changed, removed }).toEqual({ changed: [], removed: [] });
    // a new migration must be recorded with `npm run db:lock` in the same change
    expect(unlocked).toEqual([]);
  });

  it('diffLock separates changed, removed and new migrations', () => {
    expect(diffLock({ a: '1', b: '2', c: '3' }, { a: '1', b: 'X', d: '4' })).toEqual({
      changed: ['b'],
      removed: ['c'],
      unlocked: ['d'],
    });
  });
});

describe.skipIf(!available)('migration runner on PostgreSQL', () => {
  let db;
  let dir;
  let client;
  const m = () => createMigrator({ dir });
  const tables = async () =>
    (
      await client.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'mig_%' ORDER BY 1`,
      )
    ).rows.map((r) => r.table_name);

  beforeAll(async () => {
    db = await createTestDatabase({ services: [] });
    client = new pg.Client({ connectionString: db.url });
    await client.connect();
  });
  afterAll(async () => {
    await client?.end();
    await db?.drop();
  });
  beforeEach(async () => {
    await client.query(
      `DROP TABLE IF EXISTS public.schema_migration, public.mig_a, public.mig_b, public.mig_c`,
    );
    dir = await tree({
      _shared: { '0001_base.sql': 'CREATE TABLE public.mig_a (id int);' },
      billing: {
        '0001_first.sql': 'CREATE TABLE public.mig_b (id int);',
        '0002_second.sql': 'ALTER TABLE public.mig_b ADD COLUMN note text;',
      },
    });
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('applies everything pending, records it, and does nothing the second time', async () => {
    const url = db.url;
    expect(await m().up('billing', url)).toEqual([
      '_shared/0001_base',
      'billing/0001_first',
      'billing/0002_second',
    ]);
    expect(await tables()).toEqual(['mig_a', 'mig_b']);
    expect(await m().up('billing', url)).toEqual([]);
    const status = await m().status('billing', url);
    expect(status).toMatchObject({ pending: [], drifted: [], missing: [], outOfOrder: [] });
    expect(status.applied).toHaveLength(3);
  });

  it('applies up to a chosen number only', async () => {
    expect(await m().up('billing', db.url, { to: 1 })).toEqual([
      '_shared/0001_base',
      'billing/0001_first',
    ]);
    expect((await m().status('billing', db.url)).pending).toEqual(['billing/0002_second']);
  });

  it('rolls a failing migration back completely and records nothing for it', async () => {
    await writeFile(
      join(dir, 'billing', '0002_second.sql'),
      'CREATE TABLE public.mig_c (id int);\nSELECT * FROM public.does_not_exist;',
    );
    await expect(m().up('billing', db.url)).rejects.toMatchObject({ code: 'MIGRATION_FAILED' });
    expect(await tables()).toEqual(['mig_a', 'mig_b']); // mig_c from the failed file is gone
    expect((await m().status('billing', db.url)).pending).toEqual(['billing/0002_second']);
    // fixing the file lets the next run finish the job
    await writeFile(
      join(dir, 'billing', '0002_second.sql'),
      'ALTER TABLE public.mig_b ADD COLUMN note text;',
    );
    expect(await m().up('billing', db.url)).toEqual(['billing/0002_second']);
  });

  it('refuses to continue when an applied migration file was edited (drift)', async () => {
    await m().up('billing', db.url);
    await writeFile(
      join(dir, 'billing', '0001_first.sql'),
      'CREATE TABLE public.mig_b (id bigint);',
    );
    await expect(m().up('billing', db.url)).rejects.toMatchObject({
      code: 'MIGRATION_INCONSISTENT',
    });
    expect((await m().status('billing', db.url)).drifted).toEqual(['billing/0001_first']);
  });

  it('refuses when an applied migration file has gone missing', async () => {
    await m().up('billing', db.url);
    await rm(join(dir, 'billing', '0002_second.sql'));
    expect((await m().status('billing', db.url)).missing).toEqual(['billing/0002_second']);
    await expect(m().up('billing', db.url)).rejects.toThrow(/file is gone/);
  });

  it('refuses a new migration numbered below one that is already applied', async () => {
    await m().up('billing', db.url);
    await writeFile(join(dir, 'billing', '0000_late.sql'), 'SELECT 1;');
    await expect(m().up('billing', db.url)).rejects.toMatchObject({
      code: 'MIGRATION_INCONSISTENT',
    });
    expect((await m().status('billing', db.url)).outOfOrder).toEqual(['billing/0000_late']);
    await rm(join(dir, 'billing', '0000_late.sql'));
    expect(await m().up('billing', db.url)).toEqual([]); // consistent again
  });

  it('runs a no-transaction migration (CREATE INDEX CONCURRENTLY)', async () => {
    await m().up('billing', db.url);
    await writeFile(
      join(dir, 'billing', '0003_index.sql'),
      '-- migrate:no-transaction\nCREATE INDEX CONCURRENTLY mig_b_idx ON public.mig_b (id);',
    );
    expect(await m().up('billing', db.url)).toEqual(['billing/0003_index']);
    const { rows } = await client.query(`SELECT 1 FROM pg_indexes WHERE indexname = 'mig_b_idx'`);
    expect(rows).toHaveLength(1);
  });

  it('is safe when many replicas start at once: each migration runs exactly once', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => m().up('billing', db.url)));
    const applied = results.flat().sort();
    expect(applied).toEqual(['_shared/0001_base', 'billing/0001_first', 'billing/0002_second']);
    const { rows } = await client.query('SELECT count(*)::int AS n FROM public.schema_migration');
    expect(rows[0].n).toBe(3);
  });

  it('guards start-up: a service refuses a database that is behind, and accepts one that is current', async () => {
    await expect(m().assertUpToDate('billing', db.url)).rejects.toMatchObject({
      code: 'MIGRATION_PENDING',
    });
    await m().up('billing', db.url);
    expect((await m().assertUpToDate('billing', db.url)).pending).toEqual([]);
  });

  it('lets several services share one development database without confusing each other', async () => {
    await mkdir(join(dir, 'sales'), { recursive: true });
    await writeFile(join(dir, 'sales', '0001_init.sql'), 'CREATE TABLE public.mig_c (id int);');
    await m().up('billing', db.url);
    await m().up('sales', db.url);
    await m().up('billing', db.url); // must not call sales' rows "missing"
    expect((await m().status('sales', db.url)).missing).toEqual([]);
    expect(await tables()).toEqual(['mig_a', 'mig_b', 'mig_c']);
  });

  it('upAll migrates a database per service', async () => {
    await mkdir(join(dir, 'sales'), { recursive: true });
    await writeFile(join(dir, 'sales', '0001_init.sql'), 'CREATE TABLE public.mig_c (id int);');
    const other = await createTestDatabase({ services: [] });
    try {
      const done = await m().upAll({ billing: db.url, sales: other.url });
      expect(done.billing).toContain('billing/0002_second');
      expect(done.sales).toEqual(['_shared/0001_base', 'sales/0001_init']);
    } finally {
      await other.drop();
    }
  });
});

describe.skipIf(!available)('the real EstateOps migrations', () => {
  it('give every service its own database, and the schema is idempotent to re-run', async () => {
    const migrator = createMigrator({ dir: MIGRATIONS_DIR });
    const services = ['identity', 'inventory', 'customer', 'sales', 'billing', 'contract'];
    const dbs = {};
    try {
      for (const s of services) dbs[s] = await createTestDatabase({ services: [] });
      await migrator.upAll(Object.fromEntries(services.map((s) => [s, dbs[s].url])));
      for (const s of services) {
        const status = await migrator.status(s, dbs[s].url);
        expect(status.pending, s).toEqual([]);
        const client = new pg.Client({ connectionString: dbs[s].url });
        await client.connect();
        const { rows } = await client.query(
          `SELECT DISTINCT table_schema FROM information_schema.tables WHERE table_schema IN ('identity','inventory','customer','sales','billing','contract')`,
        );
        await client.end();
        // each database holds only its own service's schema
        expect(
          rows.map((r) => r.table_schema),
          s,
        ).toEqual([s]);
      }
    } finally {
      for (const d of Object.values(dbs)) await d.drop();
    }
  });
});
