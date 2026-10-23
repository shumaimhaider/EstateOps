import { describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  assertSafeTestServer,
  createTestDatabase,
  dropRunDatabases,
  dropStaleTestDatabases,
  postgresAvailable,
} from '../src/testing/index.js';

const available = await postgresAvailable();
// This file creates and drops databases on purpose, so it works under its own run id (each test
// file runs in its own worker) and only ever touches databases it created itself.
const OWN_RUN = `lifecycle${Date.now().toString(36)}`;
process.env.ESTATEOPS_TEST_RUN_ID = OWN_RUN;
const ADMIN = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/postgres';

async function exists(name) {
  const c = new pg.Client({ connectionString: ADMIN });
  await c.connect();
  const { rowCount } = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  await c.end();
  return rowCount === 1;
}

describe('test database safety', () => {
  it('only runs against a local server unless explicitly allowed', () => {
    expect(() => assertSafeTestServer('postgres://localhost:5432/postgres')).not.toThrow();
    expect(() => assertSafeTestServer('postgres://127.0.0.1:55432/postgres')).not.toThrow();
    expect(() => assertSafeTestServer('postgres://db.prod.example.com/postgres')).toThrow(
      /Refusing/,
    );
  });
});

describe.skipIf(!available)('test database lifecycle', () => {
  it('also sweeps databases named by the earlier scheme (left by a crashed run)', async () => {
    const legacy = 'estateops_test_0123456789ab';
    const c = new pg.Client({ connectionString: ADMIN });
    await c.connect();
    await c.query(`DROP DATABASE IF EXISTS ${legacy}`);
    await c.query(`CREATE DATABASE ${legacy}`);
    await c.end();
    expect(await exists(legacy)).toBe(true);
    expect(await dropStaleTestDatabases(Date.now(), { only: (n) => n === legacy })).toContain(
      legacy,
    );
    expect(await exists(legacy)).toBe(false);
  });

  it('names every database after its run and drops them all at the end of the run', async () => {
    const a = await createTestDatabase({ services: [] });
    const b = await createTestDatabase({ services: [] });
    const runId = OWN_RUN;
    expect(a.name.startsWith(`estateops_test_${runId}_`)).toBe(true);
    expect(await exists(a.name)).toBe(true);

    const dropped = await dropRunDatabases(runId);
    expect(dropped).toEqual(expect.arrayContaining([a.name, b.name]));
    expect(await exists(a.name)).toBe(false);
    expect(await exists(b.name)).toBe(false);
  });

  it('leaves databases of another run alone', async () => {
    const mine = await createTestDatabase({ services: [] });
    const dropped = await dropRunDatabases('someotherrun');
    expect(dropped).not.toContain(mine.name);
    expect(await exists(mine.name)).toBe(true);
    await mine.drop();
  });

  it('sweeps databases left behind by a crashed run, but not fresh ones', async () => {
    const fresh = await createTestDatabase({ services: [] });
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    const mine = { only: (n) => n === fresh.name };
    expect(await dropStaleTestDatabases(Date.now(), mine)).not.toContain(fresh.name); // fresh is kept
    expect(await dropStaleTestDatabases(tomorrow, mine)).toContain(fresh.name); // a day later it is stale
    expect(await exists(fresh.name)).toBe(false);
  });
});
