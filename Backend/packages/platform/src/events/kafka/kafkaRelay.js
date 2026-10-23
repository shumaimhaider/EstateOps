import { backoffMs, MAX_ATTEMPTS } from '../relay.js';
import { messageKey, topicOf } from './topics.js';

/**
 * Outbox relay that publishes to Kafka instead of calling services over HTTP. Each event goes to
 * its topic once; every consuming service reads it through its own consumer group. A row is marked
 * published only after the broker acknowledged it (idempotent producer, acks=all), so a crash
 * re-sends rather than loses; consumers drop repeats by event id.
 */
export function createKafkaRelay({
  store,
  producer,
  logger,
  batchSize = 100,
  now = () => new Date(),
}) {
  return {
    async tick() {
      const rows = await store.claim(batchSize);
      const counts = { published: 0, retry: 0, dead: 0 };
      for (const row of rows) {
        const { event } = row;
        try {
          await producer.send({
            topic: topicOf(event.type),
            acks: -1,
            messages: [
              {
                key: messageKey(event),
                value: JSON.stringify(event),
                headers: {
                  'event-id': event.id,
                  'tenant-id': event.tenant_id,
                  producer: event.producer,
                },
              },
            ],
          });
          await store.markPublished(row.id, []);
          counts.published += 1;
        } catch (error) {
          const attempts = row.attempts + 1;
          const dead = attempts >= MAX_ATTEMPTS;
          logger.warn(
            { id: row.id, type: event.type, attempts, error: error.message },
            dead ? 'event dead-lettered' : 'event retry',
          );
          await store.markFailed(row.id, {
            deliveredTo: [],
            attempts,
            nextAttemptAt: new Date(now().getTime() + backoffMs(attempts)),
            error: error.message,
            dead,
          });
          counts[dead ? 'dead' : 'retry'] += 1;
        }
      }
      return counts;
    },
  };
}
