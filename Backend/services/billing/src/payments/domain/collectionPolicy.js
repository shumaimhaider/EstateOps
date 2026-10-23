import { daysBetween } from '@estateops/kernel';

/**
 * When the automatic collector may charge an invoice to the customer's saved card.
 * The first attempt is made on the due date (or the first run after it). A failed attempt is
 * repeated after 1 day, then 3 more days, up to three attempts in all. Some failures cannot be
 * fixed by waiting (an expired or reported card, a card that needs the customer to confirm it), so
 * they are not repeated: the customer is told to update the card instead.
 */
export const COLLECTION_POLICY = Object.freeze({
  maxAttempts: 3,
  retryAfterDays: Object.freeze([1, 3]),
  noRetryCodes: Object.freeze([
    'expired_card',
    'authentication_required',
    'lost_card',
    'stolen_card',
    'pickup_card',
    'invalid_account',
    'card_not_supported',
    'NO_ACTIVE_CARD',
    'CARD_EXPIRED',
  ]),
});

/**
 * Should this invoice be charged today, and as which attempt?
 * history: { failures, lastFailureOn: 'YYYY-MM-DD'|null, lastFailureCode, inFlight }
 * @returns {{ attempt: boolean, attemptNo?: number, reason?: 'due'|'retry', skip?: string }}
 */
export function decideCollection(history, today, policy = COLLECTION_POLICY) {
  if (history.inFlight) return { attempt: false, skip: 'in_flight' };
  if (history.failures === 0) return { attempt: true, attemptNo: 1, reason: 'due' };
  if (history.failures >= policy.maxAttempts) return { attempt: false, skip: 'gave_up' };
  if (policy.noRetryCodes.includes(history.lastFailureCode))
    return { attempt: false, skip: 'needs_new_card' };
  const wait = policy.retryAfterDays[Math.min(history.failures, policy.retryAfterDays.length) - 1];
  if (daysBetween(history.lastFailureOn, today) < wait) return { attempt: false, skip: 'waiting' };
  return { attempt: true, attemptNo: history.failures + 1, reason: 'retry' };
}

/**
 * After a failed charge, when will it be tried again (for the customer's email)?
 * `failures` counts this failure. Returns { willRetry, retryOn }.
 */
export function nextRetry(failures, code, today, policy = COLLECTION_POLICY) {
  if (failures >= policy.maxAttempts || policy.noRetryCodes.includes(code)) {
    return { willRetry: false, retryOn: null };
  }
  const wait = policy.retryAfterDays[Math.min(failures, policy.retryAfterDays.length) - 1];
  const [y, m, d] = today.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + wait)).toISOString().slice(0, 10);
  return { willRetry: true, retryOn: next };
}

/** The attempt key is the same for every replay of the same attempt on the same day. */
export const attemptKeyFor = (today, attemptNo) => `${today}:${attemptNo}`;
