import { parseEvent } from '@estateops/contracts';
import { DLQ_TOPIC, topicsFor } from './topics.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One consumer group per service. A message is retried in place with backoff; if it still fails
 * (or can never be parsed) it is copied to the dead-letter topic with the reason and the offset is
 * committed, so one poison message cannot block the partition. Handlers are idempotent
 * (consumeOnce), so redelivery after a rebalance is harmless.
 */
export function createKafkaConsumer({
  service,
  consumer,
  producer,
  handlers,
  logger,
  maxAttempts = 5,
  retryDelayMs = 200,
  wait = sleep,
}) {
  async function toDeadLetter(message, topic, reason) {
    await producer.send({
      topic: DLQ_TOPIC,
      messages: [
        {
          key: message.key,
          value: message.value,
          headers: {
            'failed-service': service,
            'source-topic': topic,
            reason: String(reason).slice(0, 500),
          },
        },
      ],
    });
  }

  async function handle({ topic, message }) {
    const raw = message.value?.toString() ?? '';
    let parsed;
    try {
      parsed = parseEvent(JSON.parse(raw));
    } catch (error) {
      await toDeadLetter(message, topic, `unreadable message: ${error.message}`);
      return 'dead';
    }
    if (!parsed.ok) {
      if (parsed.unknown) return 'ignored';
      await toDeadLetter(message, topic, parsed.error);
      return 'dead';
    }
    const handler = handlers[parsed.event.type];
    if (!handler) return 'ignored';
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await handler(parsed.event);
        return 'handled';
      } catch (error) {
        lastError = error;
        logger.warn(
          { type: parsed.event.type, id: parsed.event.id, attempt, error: error.message },
          'event handler failed',
        );
        if (attempt < maxAttempts) await wait(retryDelayMs * 2 ** (attempt - 1));
      }
    }
    await toDeadLetter(message, topic, lastError.message);
    return 'dead';
  }

  return {
    handle,
    async start() {
      const topics = topicsFor(service, Object.keys(handlers));
      await consumer.connect();
      for (const topic of topics) await consumer.subscribe({ topic, fromBeginning: true });
      await consumer.run({ eachMessage: handle });
      logger.info({ service, topics }, 'kafka consumer running');
    },
    async stop() {
      await consumer.disconnect();
    },
  };
}
