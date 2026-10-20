/** Date helpers for the simulated back end. Dates are 'YYYY-MM-DD' strings; instants are ISO strings. */
import { nowMs } from './clock.js';

const MS_DAY = 86_400_000;

export const toDateString = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Today in the simulated clock (UTC calendar day). */
export const today = (db) => toDateString(nowMs(db.clock));

export const dayNumber = (dateStr) => Math.floor(Date.parse(`${dateStr}T00:00:00Z`) / MS_DAY);

/** Whole days from a to b (positive when b is later). */
export const daysBetween = (a, b) => dayNumber(b) - dayNumber(a);

export const addDays = (dateStr, days) =>
  toDateString(Date.parse(`${dateStr}T00:00:00Z`) + days * MS_DAY);

/** Same day-of-month `k` months later, with the day clamped to 28 so every month is valid. */
export function addMonths(dateStr, k) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const total = m - 1 + k;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, 28)).padStart(2, '0')}`;
}

export const monthKey = (dateStr) => dateStr.slice(0, 7);

export const atNoon = (dateStr) => `${dateStr}T10:00:00.000Z`;
