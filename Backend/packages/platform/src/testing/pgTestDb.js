import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const SQL_FILE = fileURLToPath(new URL('../../../../db/estateops.sql', import.meta.url));
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/postgres';

/** True when a PostgreSQL server accepts the admin connection, so DB suites can skip cleanly. */
export async function postgresAvailable() {
  const client = new pg.Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2_000 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a throwaway database, runs db/estateops.sql into it and returns its URL and a `drop`.
 * Existing databases are never touched: the name is random and prefixed `estateops_test_`.
 */
export async function createTestDatabase() {
  const name = `estateops_test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query(await readFile(SQL_FILE, 'utf8'));
  } finally {
    await client.end();
  }

  return {
    name,
    url: url.toString(),
    async drop() {
      const cleanup = new pg.Client({ connectionString: ADMIN_URL });
      await cleanup.connect();
      await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await cleanup.end();
    },
  };
}
