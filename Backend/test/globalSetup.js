import { randomBytes } from 'node:crypto';
import {
  dropRunDatabases,
  dropStaleTestDatabases,
  postgresAvailable,
} from '../packages/platform/src/testing/pgTestDb.js';

/**
 * Test-run lifecycle. Every database a test creates carries this run's id. When the run ends
 * (pass, fail or crash of a single suite) all of them are dropped, so the test server is left
 * exactly as it was found. Databases from crashed earlier runs are swept first.
 */
let runId;
let usable = false;

export async function setup() {
  runId = randomBytes(4).toString('hex');
  process.env.ESTATEOPS_TEST_RUN_ID = runId;
  usable = await postgresAvailable();
  if (usable) await dropStaleTestDatabases();
}

export async function teardown() {
  if (!usable) return;
  const dropped = await dropRunDatabases(runId);
  if (dropped.length)
    process.stderr.write(`[test cleanup] dropped ${dropped.length} leftover database(s)\n`);
}
