/**
 * Runs `work` once per event id. The processed marker is written in the same transaction as the
 * work, so a redelivered event changes nothing. `repos.processedEvents.markProcessed(id)` returns
 * false when the event was already handled.
 * @returns {Promise<{ duplicate: boolean }>}
 */
export async function consumeOnce(repos, event, work) {
  const first = await repos.processedEvents.markProcessed(event.id);
  if (!first) return { duplicate: true };
  await work();
  return { duplicate: false };
}
