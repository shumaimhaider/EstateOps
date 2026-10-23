import { EVENT_ROUTES } from '@estateops/contracts';

export const TOPIC_PREFIX = 'estateops';
export const DLQ_TOPIC = `${TOPIC_PREFIX}.dlq`;

/** One topic per event type, e.g. `estateops.booking.confirmed`. */
export const topicOf = (type) => `${TOPIC_PREFIX}.${type}`;

/** Topics a service consumes, from the shared routing table. */
export const topicsFor = (service, handlerTypes = null) =>
  Object.entries(EVENT_ROUTES)
    .filter(
      ([type, route]) =>
        route.consumers.includes(service) && (!handlerTypes || handlerTypes.includes(type)),
    )
    .map(([type]) => topicOf(type));

/**
 * Messages with the same key land on the same partition, so one booking's (or unit's) events are
 * handled in order. Falls back to the tenant for events without a natural aggregate.
 */
export function messageKey(event) {
  const d = event.data ?? {};
  return (
    d.booking_id ?? d.unit_id ?? d.customer_id ?? d.project_id ?? d.contract_id ?? event.tenant_id
  );
}
