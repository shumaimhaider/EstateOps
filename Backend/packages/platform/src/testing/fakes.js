import { newId } from '@estateops/kernel';

/** In-memory twins of the platform repositories, so use cases and controllers run without a DB. */
export function createFakeCommon() {
  const events = [];
  const audit = [];
  const processed = new Set();
  return {
    events,
    auditEntries: audit,
    repos: {
      outbox: { add: async (event) => void events.push(event) },
      processedEvents: {
        markProcessed: async (id) => (processed.has(id) ? false : (processed.add(id), true)),
      },
      audit: {
        record: async (entry) =>
          void audit.push({ id: newId(), ...entry, at: new Date().toISOString() }),
      },
    },
  };
}

export function createFakeIdempotencyStore() {
  const rows = new Map();
  const k = (tenantId, key, route) => `${tenantId}|${key}|${route}`;
  return {
    rows,
    find: async (tenantId, key, route) => rows.get(k(tenantId, key, route)) ?? null,
    save: async ({ tenantId, key, route, requestHash, status, body }) => {
      rows.set(k(tenantId, key, route), { requestHash, status, body });
    },
  };
}

/**
 * A unit of work over in-memory repositories. `run` snapshots nothing: atomicity is proven by the
 * infrastructure tests against PostgreSQL, not here.
 * @param {() => object} makeRepos builds the service's own fake repositories (once)
 */
export function createFakeUow(makeRepos) {
  const common = createFakeCommon();
  const repos = { ...makeRepos(), ...common.repos };
  return {
    repos,
    events: common.events,
    auditEntries: common.auditEntries,
    uow: {
      run: (work) => work(repos),
      read: (work) => work(repos),
    },
  };
}

/** Events of one type that a fake outbox collected. */
export const eventsOfType = (events, type) => events.filter((e) => e.type === type);
