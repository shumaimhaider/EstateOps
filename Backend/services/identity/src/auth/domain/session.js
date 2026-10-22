/** Sign-in timings and limits. */
export const MFA_TTL_MS = 5 * 60_000;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;
export const MAX_FAILED_ATTEMPTS = 5;
export const FAILURE_WINDOW_MS = 15 * 60_000;

export const isExpired = (expiresAt, now) => new Date(expiresAt).getTime() <= now.getTime();
export const expiresIn = (ms, now) => new Date(now.getTime() + ms);
export const windowStart = (now) => new Date(now.getTime() - FAILURE_WINDOW_MS);
