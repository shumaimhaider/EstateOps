import { createInterval } from '../http/server.js';
import { createOutboxStore } from './outboxStore.js';
import { createRelay } from './relay.js';
import { createKafka, createProducer, ensureTopics } from './kafka/kafkaClient.js';
import { createKafkaConsumer } from './kafka/kafkaConsumer.js';
import { createKafkaRelay } from './kafka/kafkaRelay.js';

/**
 * Chooses how a service's outbox reaches the other services: `EVENT_TRANSPORT=http` posts to the
 * subscribers' /internal/events (simple, no broker); `kafka` publishes to topics and reads through
 * a consumer group. Same outbox, same handlers, same idempotent consumers either way.
 * Returns { workers, start, stop }: start() before listening, stop() on shutdown.
 */
export function createEventTransport({ config, service, dataSource, schema, handlers, logger }) {
  const store = createOutboxStore(dataSource, { schema });
  const poll = (relay) =>
    createInterval({
      name: 'outbox-relay',
      fn: () => relay.tick(),
      everyMs: config.RELAY_POLL_MS,
      logger,
    });

  if (config.EVENT_TRANSPORT !== 'kafka') {
    const relay = createRelay({
      store,
      subscribers: config.subscribers,
      internalToken: config.INTERNAL_TOKEN,
      logger,
    });
    return { workers: [poll(relay)], start: async () => {}, stop: async () => {} };
  }

  const kafka = createKafka(config);
  let producer;
  let consumer;
  const lazyRelay = {
    tick: async () => {
      if (!producer) return { published: 0, retry: 0, dead: 0 };
      return createKafkaRelay({ store, producer, logger }).tick();
    },
  };
  return {
    workers: [poll(lazyRelay)],
    async start() {
      await ensureTopics(kafka, { partitions: config.KAFKA_PARTITIONS });
      producer = await createProducer(kafka);
      if (Object.keys(handlers).length > 0) {
        consumer = createKafkaConsumer({
          service,
          consumer: kafka.consumer({ groupId: `estateops-${service}` }),
          producer,
          handlers,
          logger,
        });
        await consumer.start();
      }
    },
    async stop() {
      await consumer?.stop();
      await producer?.disconnect();
    },
  };
}
