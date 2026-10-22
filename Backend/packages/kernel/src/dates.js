/** Dates are 'YYYY-MM-DD' strings in UTC; instants are ISO strings. */
const MS_DAY = 86_400_000;

export const toDateString = (ms) => new Date(ms).toISOString().slice(0, 10);
export const dayNumber = (date) => Math.floor(Date.parse(`${date}T00:00:00Z`) / MS_DAY);
/** Whole days from a to b (positive when b is later). */
export const daysBetween = (a, b) => dayNumber(b) - dayNumber(a);
export const addDays = (date, days) =>
  toDateString(Date.parse(`${date}T00:00:00Z`) + days * MS_DAY);
/** Any date-like value to an ISO string (or null). */
export const toIso = (value) =>
  value === null || value === undefined ? null : new Date(value).toISOString();
export const monthKey = (date) => date.slice(0, 7);
export const isIsoDate = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value));

/** Same day-of-month `k` months later, with the day capped at 28 so every month is valid. */
export function addMonths(date, k) {
  const [y, m, d] = date.split('-').map(Number);
  const total = m - 1 + k;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, 28)).padStart(2, '0')}`;
}
