/** One key per user action; reused on retry so the server can replay the first response. */
export function newIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}
