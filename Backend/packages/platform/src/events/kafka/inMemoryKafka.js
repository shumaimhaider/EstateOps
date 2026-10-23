/**
 * A tiny Kafka stand-in for unit tests: topics are arrays, `send` appends, and a consumer reads
 * what was sent. Mirrors only what the relay and consumer use.
 */
export function createInMemoryKafka() {
  const topics = new Map();
  const failures = [];
  const log = (topic) => topics.get(topic) ?? topics.set(topic, []).get(topic);
  return {
    topics,
    failNextSend(error = new Error('broker down'), times = 1) {
      for (let i = 0; i < times; i += 1) failures.push(error);
    },
    producer: {
      async send({ topic, messages }) {
        if (failures.length) throw failures.shift();
        for (const m of messages) {
          log(topic).push({ key: m.key, value: Buffer.from(m.value), headers: m.headers ?? {} });
        }
      },
    },
    messages: (topic) => log(topic),
  };
}
