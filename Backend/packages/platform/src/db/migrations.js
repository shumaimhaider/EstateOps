import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

/**
 * Versioned, forward-only database migrations. Every service owns its own database and its own
 * folder of numbered files; a `_shared` folder holds what every service database needs.
 *
 *   db/migrations/_shared/0001_shared_housekeeping.sql
 *   db/migrations/billing/0001_initial.sql
 *   db/migrations/billing/0002_add_invoice_note.sql
 *
 * Rules the runner enforces (see docs/migrations.md):
 *   - Files are `NNNN_snake_case.sql`, numbers unique and applied in order, shared before service.
 *   - Each migration runs in its own transaction, so a failure leaves nothing half applied.
 *     A file starting with `-- migrate:no-transaction` runs outside one (single statement only,
 *     for things like CREATE INDEX CONCURRENTLY).
 *   - Applied migrations are immutable: the SHA-256 of each file is stored, and a changed file is
 *     reported as drift instead of being silently skipped.
 *   - A pending migration numbered below one already applied is refused (out-of-order).
 *   - One runner at a time per database (advisory lock), so several replicas can start together.
 */
export const SHARED = '_shared';
export const NO_TRANSACTION = '-- migrate:no-transaction';
export const TRACKING_TABLE = 'public.schema_migration';
const LOCK_KEY = 'estateops:migrate';
const FILE_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;

export class MigrationError extends Error {
  constructor(message, { code = 'MIGRATION_ERROR', details = [] } = {}) {
    super(message);
    this.name = 'MigrationError';
    this.code = code;
    this.details = details;
  }
}

const checksum = (text) => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
const silent = { info() {}, warn() {} };

/**
 * @param {{ dir: string, logger?: { info: Function, warn: Function } }} options
 *   `dir` is the migrations root (the folder that holds `_shared` and one folder per service).
 */
export function createMigrator({ dir, logger = silent }) {
  /** All migrations a service database should have, in application order. */
  async function load(service) {
    const out = [];
    for (const scope of [SHARED, service]) {
      let names;
      try {
        names = (await readdir(join(dir, scope))).filter((n) => n.endsWith('.sql')).sort();
      } catch (error) {
        if (error.code === 'ENOENT') {
          if (scope === service) throw new MigrationError(`No migrations folder for "${service}"`);
          continue;
        }
        throw error;
      }
      const seen = new Set();
      for (const name of names) {
        const match = FILE_PATTERN.exec(name);
        if (!match) {
          throw new MigrationError(`${scope}/${name}: use the form 0001_snake_case_name.sql`, {
            code: 'MIGRATION_BAD_NAME',
          });
        }
        if (seen.has(match[1])) {
          throw new MigrationError(`${scope}: two migrations are numbered ${match[1]}`, {
            code: 'MIGRATION_DUPLICATE_NUMBER',
          });
        }
        seen.add(match[1]);
        const sql = await readFile(join(dir, scope, name), 'utf8');
        out.push({
          id: `${scope}/${name.replace(/\.sql$/, '')}`,
          scope,
          number: Number(match[1]),
          sql,
          checksum: checksum(sql),
          transactional: !sql.trimStart().startsWith(NO_TRANSACTION),
        });
      }
    }
    return out;
  }

  async function withLockedClient(url, work) {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      await client.query('SELECT pg_advisory_lock(hashtext($1))', [LOCK_KEY]);
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
          id          text PRIMARY KEY,
          checksum    text        NOT NULL,
          applied_at  timestamptz NOT NULL DEFAULT now(),
          duration_ms int         NOT NULL DEFAULT 0
        )`);
      return await work(client);
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_KEY]).catch(() => {});
      await client.end();
    }
  }

  /** Compares files with what the database has recorded. */
  function plan(files, applied) {
    const byId = new Map(applied.map((a) => [a.id, a]));
    const drifted = files
      .filter((f) => byId.has(f.id) && byId.get(f.id).checksum !== f.checksum)
      .map((f) => f.id);
    const missing = applied.filter((a) => !files.some((f) => f.id === a.id)).map((a) => a.id);
    const pending = files.filter((f) => !byId.has(f.id));
    const outOfOrder = pending.filter((p) =>
      files.some((f) => f.scope === p.scope && byId.has(f.id) && f.number > p.number),
    );
    return { drifted, missing, pending, outOfOrder };
  }

  function assertSound({ drifted, missing, outOfOrder }) {
    const problems = [
      ...drifted.map(
        (id) => `${id} was changed after it was applied (add a new migration instead)`,
      ),
      ...missing.map((id) => `${id} is applied but its file is gone`),
      ...outOfOrder.map((m) => `${m.id} is numbered below a migration that is already applied`),
    ];
    if (problems.length) {
      throw new MigrationError(`Migrations are not consistent:\n- ${problems.join('\n- ')}`, {
        code: 'MIGRATION_INCONSISTENT',
        details: problems,
      });
    }
  }

  /** Rows this service is responsible for: the shared scope and its own (other services may share a dev database). */
  async function applied(client, service) {
    const { rows } = await client.query(
      `SELECT id, checksum, applied_at FROM ${TRACKING_TABLE} ORDER BY id`,
    );
    return rows.filter((r) => r.id.startsWith(`${SHARED}/`) || r.id.startsWith(`${service}/`));
  }

  async function applyOne(client, migration) {
    const started = Date.now();
    const record = () =>
      client.query(
        `INSERT INTO ${TRACKING_TABLE} (id, checksum, duration_ms) VALUES ($1, $2, $3)`,
        [migration.id, migration.checksum, Date.now() - started],
      );
    if (!migration.transactional) {
      await client.query(migration.sql);
      await record();
      return;
    }
    await client.query('BEGIN');
    try {
      await client.query(migration.sql);
      await record();
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw new MigrationError(`${migration.id} failed and was rolled back: ${error.message}`, {
        code: 'MIGRATION_FAILED',
        details: [error.message],
      });
    }
  }

  return {
    load,

    /** What is applied and what is waiting, without changing anything. */
    async status(service, url) {
      const files = await load(service);
      return withLockedClient(url, async (client) => {
        const result = plan(files, await applied(client, service));
        return {
          service,
          applied: files.filter((f) => !result.pending.includes(f)).map((f) => f.id),
          pending: result.pending.map((m) => m.id),
          drifted: result.drifted,
          missing: result.missing,
          outOfOrder: result.outOfOrder.map((m) => m.id),
        };
      });
    },

    /** Applies everything pending (or up to migration number `to`). Returns the ids it applied. */
    async up(service, url, { to = Infinity } = {}) {
      const files = await load(service);
      return withLockedClient(url, async (client) => {
        const result = plan(files, await applied(client, service));
        assertSound(result);
        const run = [];
        for (const migration of result.pending) {
          if (migration.scope === service && migration.number > to) continue;
          await applyOne(client, migration);
          logger.info({ service, migration: migration.id }, 'migration applied');
          run.push(migration.id);
        }
        return run;
      });
    },

    /** Applies several services. `urls`: { serviceName: databaseUrl }. */
    async upAll(urls, options) {
      const out = {};
      for (const [service, url] of Object.entries(urls))
        out[service] = await this.up(service, url, options);
      return out;
    },

    /**
     * Start-up guard for a service: refuse to run against a database that is behind or has
     * drifted. Throws MigrationError; never changes the database.
     */
    async assertUpToDate(service, url) {
      const state = await this.status(service, url);
      if (
        state.pending.length ||
        state.drifted.length ||
        state.missing.length ||
        state.outOfOrder.length
      ) {
        throw new MigrationError(
          `Database for "${service}" is not up to date. Run \`npm run db:migrate\`. ` +
            `Pending: ${state.pending.join(', ') || 'none'}. ` +
            `Problems: ${[...state.drifted, ...state.missing, ...state.outOfOrder].join(', ') || 'none'}.`,
          { code: 'MIGRATION_PENDING', details: state.pending },
        );
      }
      return state;
    },
  };
}

/** SHA-256 of every migration file, keyed by id: what `db/migrations.lock.json` records. */
export async function computeLock(dir) {
  const probe = createMigrator({ dir });
  const lock = {};
  const scopes = (await readdir(dir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const scope of scopes) {
    const loaded = await probe.load(scope === SHARED ? SHARED : scope);
    for (const m of loaded.filter((x) => x.scope === scope)) lock[m.id] = m.checksum;
  }
  return lock;
}

/**
 * Compares the lock file with the files on disk. New migrations are fine to add (they are only
 * "unlocked"); a changed or removed locked migration is a problem, because it may already be applied.
 */
export function diffLock(locked, current) {
  return {
    changed: Object.keys(locked).filter((id) => id in current && current[id] !== locked[id]),
    removed: Object.keys(locked).filter((id) => !(id in current)),
    unlocked: Object.keys(current).filter((id) => !(id in locked)),
  };
}
