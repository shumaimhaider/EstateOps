import { nowIso } from './clock.js';

/**
 * Append-only audit log. Every state change calls this with the before/after snapshots.
 * Entries are frozen; there is no update or delete.
 */
export function appendAudit(
  db,
  { actor, action, subjectType, subjectId, before = null, after = null },
) {
  const entry = Object.freeze({
    id: globalThis.crypto.randomUUID(),
    tenant_id: actor.tenantId,
    actor_id: actor.id,
    actor_name: actor.name,
    action,
    subject_type: subjectType,
    subject_id: subjectId,
    before,
    after,
    ip: '10.0.0.7',
    created_at: nowIso(db.clock),
  });
  db.audit.push(entry);
  return entry;
}
