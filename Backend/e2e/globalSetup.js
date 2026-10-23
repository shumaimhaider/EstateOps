import { randomBytes } from 'node:crypto';
import { Redis } from 'ioredis';
import {
  dropRunDatabases,
  dropStaleTestDatabases,
  postgresAvailable,
} from '../packages/platform/src/testing/pgTestDb.js';

/**
 * End-to-end run lifecycle. Every database a journey creates carries this run's id, and all of them
 * are dropped when the run ends (pass, fail or crash of a single file). Redis, when used, must be a
 * numbered database other than 0 (E2E_REDIS_URL=redis://host:6379/14): it is emptied before and
 * after the run, so it can never wipe a database someone else is using.
 */
let runId;
let usable = false;

async function flushRedis() {
  const url = process.env.E2E_REDIS_URL;
  if (!url) return;
  const db = Number(new URL(url).pathname.slice(1));
  if (!Number.isInteger(db) || db < 1) {
    throw new Error(
      'E2E_REDIS_URL must name a numbered database other than 0, for example redis://localhost:6379/14',
    );
  }
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    await redis.flushdb();
  } finally {
    redis.disconnect();
  }
}

export async function setup() {
  runId = randomBytes(4).toString('hex');
  process.env.ESTATEOPS_TEST_RUN_ID = runId;
  usable = await postgresAvailable();
  if (!usable)
    throw new Error(
      'The end-to-end suite needs PostgreSQL: set TEST_DATABASE_URL to a local test server',
    );
  await dropStaleTestDatabases();
  await flushRedis();
}

export async function teardown() {
  if (!usable) return;
  const dropped = await dropRunDatabases(runId);
  if (dropped.length)
    process.stderr.write(`[e2e cleanup] dropped ${dropped.length} leftover database(s)\n`);
  await flushRedis();
}
