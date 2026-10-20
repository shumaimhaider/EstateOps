import { getDb, persist } from '../db/db.js';
import { MockApiError } from '../engine/errors.js';
import { resolveContext } from '../engine/context.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Simulated latency, random failures and forced errors (?__fail=409, header, or dev panel). */
async function simulate(request, name, db) {
  const [min, max] = db.settings.latencyMs;
  if (max > 0) await sleep(min + Math.random() * (max - min));

  const forced =
    new URL(request.url).searchParams.get('__fail') ??
    request.headers.get('x-mock-fail') ??
    db.settings.forcedErrors[name];
  if (forced) {
    throw new MockApiError(Number(forced), 'MOCK_FORCED_ERROR', `Forced ${forced} for ${name}`);
  }
  if (db.settings.failureRate > 0 && Math.random() < db.settings.failureRate) {
    throw new MockApiError(503, 'MOCK_RANDOM_FAILURE', 'Simulated transient failure');
  }
}

/**
 * Transport-neutral request pipeline shared by REST and GraphQL handlers: latency/failures,
 * auth context, idempotent replay of writes, persistence. `perform(db, ctx)` returns a
 * DTO-shaped result or throws MockApiError.
 */
export async function runOperation(request, { name, write = false, isPublic = false, perform }) {
  const db = getDb();
  await simulate(request, name, db);
  const ctx = isPublic ? null : resolveContext(db, request.headers.get('Authorization'));

  if (!write) return perform(db, ctx);

  const key = request.headers.get('Idempotency-Key');
  const slot = key && ctx ? `${ctx.tenant.id}:${name}:${key}` : null;
  if (slot && db.idempotency[slot]) return db.idempotency[slot];

  const result = perform(db, ctx);
  if (slot) db.idempotency[slot] = result;
  persist();
  return result;
}

export function toInternalError(error) {
  return error instanceof MockApiError
    ? error
    : new MockApiError(500, 'INTERNAL_ERROR', error?.message ?? 'Internal error');
}
