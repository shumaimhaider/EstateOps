import { consumersOf } from '@estateops/contracts';

export const MAX_ATTEMPTS = 10;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 5 * 60_000;

/** 500 ms doubling to 5 minutes. */
export const backoffMs = (attempts) =>
  Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_DELAY_MS);

/**
 * Outbox relay: delivers each event to the services that consume it (at-least-once, in claim
 * order per service). Pure logic over a store and a `fetch`, so it is unit-testable without a
 * database or network. `subscribers`: { serviceName: baseUrl }.
 */
export function createRelay({
  store,
  subscribers,
  internalToken,
  fetchImpl = fetch,
  logger,
  batchSize = 50,
  now = () => new Date(),
  timeoutMs = 5_000,
}) {
  async function deliver(baseUrl, event) {
    const response = await fetchImpl(`${baseUrl}/internal/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-token': internalToken },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`${baseUrl} answered ${response.status}`);
  }

  async function handle(row) {
    const targets = consumersOf(row.event.type);
    const delivered = new Set(row.deliveredTo);
    const errors = [];
    for (const service of targets) {
      if (delivered.has(service)) continue;
      const baseUrl = subscribers[service];
      if (!baseUrl) {
        errors.push(`${service}: no subscriber URL configured`);
        continue;
      }
      try {
        await deliver(baseUrl, row.event);
        delivered.add(service);
      } catch (error) {
        errors.push(`${service}: ${error.message}`);
      }
    }
    if (errors.length === 0) {
      await store.markPublished(row.id, [...delivered]);
      return 'published';
    }
    const attempts = row.attempts + 1;
    const dead = attempts >= MAX_ATTEMPTS;
    logger.warn(
      { id: row.id, type: row.event.type, attempts, errors },
      dead ? 'event dead-lettered' : 'event retry',
    );
    await store.markFailed(row.id, {
      deliveredTo: [...delivered],
      attempts,
      nextAttemptAt: new Date(now().getTime() + backoffMs(attempts)),
      error: errors.join('; '),
      dead,
    });
    return dead ? 'dead' : 'retry';
  }

  return {
    /** Sends one batch. Returns counts so callers and tests can see what happened. */
    async tick() {
      const rows = await store.claim(batchSize);
      const counts = { published: 0, retry: 0, dead: 0 };
      for (const row of rows) counts[await handle(row)] += 1;
      return counts;
    },
  };
}
