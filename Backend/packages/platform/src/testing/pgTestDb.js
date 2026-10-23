import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { createMigrator } from '../db/migrations.js';

export const SERVICES = ['identity', 'inventory', 'customer', 'sales', 'billing', 'contract'];
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../../../db/migrations', import.meta.url));
const migrator = createMigrator({ dir: MIGRATIONS_DIR });

const ADMIN_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/postgres';
const PREFIX = 'estateops_test_';
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'postgres',
  'host.docker.internal',
]);

/**
 * Safety: the test suite creates and DROPS databases, so it only runs against a server that is
 * clearly a development or test one: a local host, or one you explicitly allowed.
 */
export function assertSafeTestServer(url = ADMIN_URL) {
  const host = new URL(url).hostname;
  if (LOCAL_HOSTS.has(host) || process.env.TEST_DATABASE_ALLOW_REMOTE === '1') return;
  throw new Error(
    `Refusing to run tests against "${host}". TEST_DATABASE_URL must point at a local test server ` +
      '(set TEST_DATABASE_ALLOW_REMOTE=1 only for a dedicated, disposable test server).',
  );
}

/** Every database this run creates carries the run id, so teardown drops exactly its own. */
const runId = () => process.env.ESTATEOPS_TEST_RUN_ID ?? 'adhoc';

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
 * Creates a throwaway database and applies service schemas to it (all by default; pass
 * `services` to install only the ones a suite needs). Existing databases are never touched: the
 * name is random and prefixed `estateops_test_`.
 */
export async function createTestDatabase({ services = SERVICES } = {}) {
  assertSafeTestServer();
  const name = `${PREFIX}${runId()}_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  for (const service of services) await migrator.up(service, url.toString());

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

async function withAdmin(work) {
  assertSafeTestServer();
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    return await work(admin);
  } finally {
    await admin.end();
  }
}

const listTestDatabases = async (admin) =>
  (
    await admin.query('SELECT datname FROM pg_database WHERE datname LIKE $1', [`${PREFIX}%`])
  ).rows.map((r) => r.datname);

/** Drops every test database created by one run (default: this run). Returns the dropped names. */
export async function dropRunDatabases(id = runId()) {
  return withAdmin(async (admin) => {
    const mine = (await listTestDatabases(admin)).filter((n) => n.startsWith(`${PREFIX}${id}_`));
    for (const name of mine) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    return mine;
  });
}

/**
 * Drops test databases left behind by runs that crashed: older than six hours, or named by the
 * earlier scheme (`estateops_test_<12 hex>`, no run id), which only a crashed run can leave.
 */
export async function dropStaleTestDatabases(now = Date.now(), { only = () => true } = {}) {
  return withAdmin(async (admin) => {
    const stale = (await listTestDatabases(admin)).filter((name) => {
      if (!only(name)) return false;
      if (/^estateops_test_[0-9a-f]{12}$/.test(name)) return true;
      const stamp = Number.parseInt(name.slice(PREFIX.length).split('_')[1] ?? '', 36);
      return Number.isFinite(stamp) && now - stamp > STALE_AFTER_MS;
    });
    for (const name of stale) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    return stale;
  });
}
