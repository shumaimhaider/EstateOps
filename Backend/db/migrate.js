#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { computeLock, createMigrator, diffLock } from '@estateops/platform';

/**
 * Migration CLI. Every service has its own database, so every command names its own URLs:
 *
 *   node db/migrate.js up     identity=$IDENTITY_DB billing=$BILLING_DB ...
 *   node db/migrate.js status identity=$IDENTITY_DB
 *   node db/migrate.js new    billing add_invoice_note
 *   node db/migrate.js lock   # record checksums of new migrations in db/migrations.lock.json
 *
 * Or set DATABASE_URL_<SERVICE> variables (DATABASE_URL_BILLING ...) and omit the pairs.
 */
const dir = fileURLToPath(new URL('./migrations', import.meta.url));
const LOCK_FILE = fileURLToPath(new URL('./migrations.lock.json', import.meta.url));
const SERVICES = ['identity', 'inventory', 'customer', 'sales', 'billing', 'contract'];
const log = { info: (o, m) => process.stdout.write(`  ${o.migration}  ${m}\n`), warn() {} };

function targets(args) {
  const fromArgs = Object.fromEntries(
    args.filter((a) => a.includes('=')).map((a) => a.split(/=(.*)/s).slice(0, 2)),
  );
  if (Object.keys(fromArgs).length) return fromArgs;
  return Object.fromEntries(
    SERVICES.filter((s) => process.env[`DATABASE_URL_${s.toUpperCase()}`]).map((s) => [
      s,
      process.env[`DATABASE_URL_${s.toUpperCase()}`],
    ]),
  );
}

async function scaffold(service, name) {
  if (!SERVICES.includes(service) || !/^[a-z0-9_]+$/.test(name ?? '')) {
    throw new Error('usage: node db/migrate.js new <service> <snake_case_name>');
  }
  const folder = join(dir, service);
  await mkdir(folder, { recursive: true });
  const last = (await readdir(folder)).map((n) => Number(n.slice(0, 4))).filter(Number.isFinite);
  const next = String(Math.max(0, ...last) + 1).padStart(4, '0');
  const file = join(folder, `${next}_${name}.sql`);
  await writeFile(
    file,
    `-- ${service}: ${name.replace(/_/g, ' ')}\n-- Expand, migrate, contract: never rename or drop in the same release that stops using a column.\n-- The runner wraps this file in a transaction. Do not edit it once it has been applied anywhere.\n\n`,
  );
  process.stdout.write(`created ${file}\n`);
}

const [command, ...rest] = process.argv.slice(2);
const migrator = createMigrator({ dir, logger: log });

try {
  if (command === 'new') await scaffold(rest[0], rest[1]);
  else if (command === 'lock') {
    const locked = JSON.parse(await readFile(LOCK_FILE, 'utf8').catch(() => '{}'));
    const current = await computeLock(dir);
    const { changed, removed, unlocked } = diffLock(locked, current);
    if (changed.length || removed.length) {
      throw new Error(
        `Applied migrations must never change.\nChanged: ${changed.join(', ') || '-'}\nRemoved: ${removed.join(', ') || '-'}`,
      );
    }
    await writeFile(LOCK_FILE, `${JSON.stringify(current, null, 2)}\n`);
    process.stdout.write(
      unlocked.length ? `locked ${unlocked.join(', ')}\n` : 'lock file already up to date\n',
    );
  } else if (command === 'up' || command === 'status') {
    const urls = targets(rest);
    if (!Object.keys(urls).length)
      throw new Error('give <service>=<url> pairs or DATABASE_URL_<SERVICE> variables');
    if (command === 'up') {
      const done = await migrator.upAll(urls);
      const count = Object.values(done).reduce((n, l) => n + l.length, 0);
      process.stdout.write(count ? `applied ${count} migration(s)\n` : 'already up to date\n');
    } else {
      let bad = false;
      for (const [service, url] of Object.entries(urls)) {
        const s = await migrator.status(service, url);
        bad ||= Boolean(
          s.pending.length || s.drifted.length || s.missing.length || s.outOfOrder.length,
        );
        process.stdout.write(
          `${service}: ${s.applied.length} applied, ${s.pending.length} pending` +
            `${s.drifted.length ? `, DRIFT ${s.drifted.join(', ')}` : ''}${s.missing.length ? `, MISSING ${s.missing.join(', ')}` : ''}\n`,
        );
      }
      process.exitCode = bad ? 1 : 0;
    }
  } else {
    process.stderr.write('usage: node db/migrate.js <up|status|new> ...\n');
    process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
