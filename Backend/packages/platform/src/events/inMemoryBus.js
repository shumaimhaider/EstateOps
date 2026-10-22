import { consumersOf, parseEvent } from '@estateops/contracts';

/**
 * Test and single-process bus: the same routing as the relay, delivered in memory.
 * `subscribe(service, handler)` where handler(event) returns a promise.
 */
export function createInMemoryBus() {
  const handlers = new Map();
  const queue = [];
  const log = [];
  return {
    log,
    subscribe(service, handler) {
      handlers.set(service, handler);
    },
    /** Queue an event envelope for later delivery (what an outbox row would hold). */
    publish(event) {
      queue.push(event);
    },
    pending: () => queue.length,
    /** Delivers everything queued, including events produced while delivering. */
    async drain({ maxEvents = 1000 } = {}) {
      let delivered = 0;
      while (queue.length > 0) {
        if (delivered++ >= maxEvents) throw new Error('Event loop did not settle');
        const event = queue.shift();
        const parsed = parseEvent(event);
        if (!parsed.ok) throw new Error(`Bad event on bus: ${parsed.error}`);
        for (const service of consumersOf(event.type)) {
          const handler = handlers.get(service);
          if (!handler) throw new Error(`No subscriber registered for ${service}`);
          await handler(parsed.event);
          log.push({ type: event.type, to: service });
        }
      }
      return delivered;
    },
  };
}
