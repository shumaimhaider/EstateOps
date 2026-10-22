import { newId } from '@estateops/kernel';
import { table } from './sql.js';

/**
 * Repositories every service has: outbox, processed events, audit log. They run on the current
 * transaction's EntityManager, so an event and an audit entry commit with the data they describe.
 */
export function buildCommonRepos(manager, { schema }) {
  const outboxT = table(schema, 'outbox');
  const processedT = table(schema, 'processed_event');
  const auditT = table(schema, 'audit_log');

  return {
    outbox: {
      /** `event` is a full envelope from @estateops/contracts buildEvent(). */
      async add(event) {
        await manager.query(
          `INSERT INTO ${outboxT} (id, tenant_id, type, payload) VALUES ($1, $2, $3, $4::jsonb)`,
          [event.id, event.tenant_id, event.type, JSON.stringify(event)],
        );
      },
    },
    processedEvents: {
      /** True the first time an event id is seen, false for a redelivery. */
      async markProcessed(eventId) {
        const rows = await manager.query(
          `INSERT INTO ${processedT} (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id`,
          [eventId],
        );
        return rows.length === 1;
      },
    },
    audit: {
      async record({
        tenantId,
        actor,
        action,
        subjectType,
        subjectId,
        before = null,
        after = null,
      }) {
        await manager.query(
          `INSERT INTO ${auditT} (id, tenant_id, actor_id, actor_name, action, subject_type, subject_id, before, after)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)`,
          [
            newId(),
            tenantId,
            actor?.userId ?? null,
            actor?.name ?? null,
            action,
            subjectType,
            String(subjectId),
            before === null ? null : JSON.stringify(before),
            after === null ? null : JSON.stringify(after),
          ],
        );
      },
    },
  };
}

/** Stored responses for Idempotency-Key replays. Uses the pool directly (not the request tx). */
export function createIdempotencyStore(dataSource, { schema }) {
  const t = table(schema, 'idempotency_key');
  return {
    async find(tenantId, key, route) {
      const rows = await dataSource.query(
        `SELECT request_hash, status, body FROM ${t} WHERE tenant_id = $1 AND key = $2 AND route = $3`,
        [tenantId, key, route],
      );
      if (rows.length === 0) return null;
      return { requestHash: rows[0].request_hash, status: rows[0].status, body: rows[0].body };
    },
    async save({ tenantId, key, route, requestHash, status, body }) {
      await dataSource.query(
        `INSERT INTO ${t} (tenant_id, key, route, request_hash, status, body)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb) ON CONFLICT DO NOTHING`,
        [tenantId, key, route, requestHash, status, JSON.stringify(body ?? null)],
      );
    },
    /** Housekeeping: keys older than `days` are no longer replayable. */
    async purge(days = 7) {
      await dataSource.query(
        `DELETE FROM ${t} WHERE created_at < now() - ($1 || ' days')::interval`,
        [String(days)],
      );
    },
  };
}
