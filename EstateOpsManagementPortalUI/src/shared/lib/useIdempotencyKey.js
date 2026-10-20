import { useRef } from 'react';
import { newIdempotencyKey } from './idempotencyKey.js';

/**
 * Stable key per user action. The same key is returned while the payload is
 * unchanged (so a retry replays), and a new one is minted when the payload
 * changes or after reset() on success.
 */
export function useIdempotencyKey() {
  const ref = useRef({ key: null, fingerprint: null });
  return {
    get(payload) {
      const fingerprint = JSON.stringify(payload ?? null);
      if (!ref.current.key || ref.current.fingerprint !== fingerprint) {
        ref.current = { key: newIdempotencyKey(), fingerprint };
      }
      return ref.current.key;
    },
    reset() {
      ref.current = { key: null, fingerprint: null };
    },
  };
}
