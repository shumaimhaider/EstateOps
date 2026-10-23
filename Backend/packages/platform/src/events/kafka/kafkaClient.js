import { z } from 'zod';
import { Kafka, logLevel } from 'kafkajs';
import { DLQ_TOPIC, TOPIC_PREFIX } from './topics.js';
import { EVENT_ROUTES } from '@estateops/contracts';

/** Environment for the event transport. Spread into a service's config schema. */
export const EVENT_TRANSPORT_ENV = {
  EVENT_TRANSPORT: z.enum(['http', 'kafka']).default('http'),
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  KAFKA_CLIENT_ID: z.string().default('estateops'),
  KAFKA_PARTITIONS: z.coerce.number().int().positive().default(6),
};

export const createKafka = (config) =>
  new Kafka({
    clientId: config.KAFKA_CLIENT_ID,
    brokers: config.KAFKA_BROKERS.split(',').map((b) => b.trim()),
    logLevel: logLevel.WARN,
  });

/** An idempotent producer: retries cannot create duplicates inside one producer session. */
export async function createProducer(kafka) {
  const producer = kafka.producer({ idempotent: true, maxInFlightRequests: 1 });
  await producer.connect();
  return producer;
}

/** Creates every event topic (and the dead-letter topic) if missing. Safe to run on every start. */
export async function ensureTopics(kafka, { partitions = 6, replicationFactor = 1 } = {}) {
  const admin = kafka.admin();
  await admin.connect();
  try {
    const topics = [...Object.keys(EVENT_ROUTES).map((t) => `${TOPIC_PREFIX}.${t}`), DLQ_TOPIC];
    await admin.createTopics({
      waitForLeaders: true,
      topics: topics.map((topic) => ({ topic, numPartitions: partitions, replicationFactor })),
    });
  } finally {
    await admin.disconnect();
  }
}
