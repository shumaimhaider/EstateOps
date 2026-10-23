import { formatInTimeZone } from 'date-fns-tz';

/** Dates travel through the app as ISO-8601 strings; they are formatted only at the edge,
 * always in the tenant time zone. */
export function formatDateTime(iso, timeZone) {
  if (!iso) return '';
  return formatInTimeZone(new Date(iso), timeZone, 'dd MMM yyyy, HH:mm');
}

export function formatDate(iso, timeZone) {
  if (!iso) return '';
  return formatInTimeZone(new Date(iso), timeZone, 'dd MMM yyyy');
}

/** Calendar dates ('YYYY-MM-DD') have no time zone: format them without converting. */
export function formatDateOnly(dateStr) {
  if (!dateStr) return '';
  const [y, m, day] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, day)));
}

/** 'YYYY-MM' -> 'Oct 26' */
export function formatMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}
