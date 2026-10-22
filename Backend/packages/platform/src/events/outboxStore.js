import { rowsOf, table } from '../db/sql.js';

/**
 * SQL side of the relay. `claim` leases a batch for 30 seconds with SKIP LOCKED, so many replicas
 * can run the relay without ever sending the same row twice at once.
 */
export function createOutboxStore(dataSource, { schema }) {
  const t = table(schema, 'outbox');
  return {
    async claim(limit) {
      const result = await dataSource.query(
        `UPDATE ${t} SET next_attempt_at = now() + interval '30 seconds'
          WHERE id IN (SELECT id FROM ${t}
                        WHERE status = 'pending' AND next_attempt_at <= now()
                        ORDER BY created_at
                        LIMIT $1 FOR UPDATE SKIP LOCKED)
        RETURNING id, payload, attempts, delivered_to`,
        [limit],
      );
      const rows = rowsOf(result);
      // UPDATE ... RETURNING has no order guarantee, so restore creation order of events
      return rows
        .map((r) => ({
          id: r.id,
          event: r.payload,
          attempts: r.attempts,
          deliveredTo: r.delivered_to,
        }))
        .sort((a, b) => a.event.occurred_at.localeCompare(b.event.occurred_at));
    },
    async markPublished(id, deliveredTo) {
      await dataSource.query(
        `UPDATE ${t} SET status = 'published', published_at = now(), delivered_to = $2 WHERE id = $1`,
        [id, deliveredTo],
      );
    },
    async markFailed(id, { deliveredTo, attempts, nextAttemptAt, error, dead }) {
      await dataSource.query(
        `UPDATE ${t} SET status = $2, attempts = $3, delivered_to = $4, next_attempt_at = $5, last_error = $6
          WHERE id = $1`,
        [
          id,
          dead ? 'dead' : 'pending',
          attempts,
          deliveredTo,
          nextAttemptAt,
          String(error).slice(0, 500),
        ],
      );
    },
    /** Published rows are only history; keep a week. */
    async purgePublished(days = 7) {
      await dataSource.query(
        `DELETE FROM ${t} WHERE status = 'published' AND published_at < now() - ($1 || ' days')::interval`,
        [String(days)],
      );
    },
  };
}
