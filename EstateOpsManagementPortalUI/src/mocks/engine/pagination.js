import { MockApiError } from './errors.js';

const encode = (offset) => btoa(`o:${offset}`);

function decode(cursor) {
  if (!cursor) return 0;
  try {
    const match = /^o:(\d+)$/.exec(atob(cursor));
    if (match) return Number(match[1]);
  } catch {
    /* fall through */
  }
  throw new MockApiError(400, 'INVALID_CURSOR', 'The pagination cursor is not valid');
}

/** Opaque offset cursors. Returns rows plus a cursor per row (for GraphQL edges). */
export function paginate(rows, { cursor, limit } = {}) {
  const size = Math.min(Math.max(Number(limit) || 25, 1), 200);
  const start = decode(cursor);
  const slice = rows.slice(start, start + size);
  const end = start + slice.length;
  return {
    items: slice,
    cursors: slice.map((_, i) => encode(start + i + 1)),
    nextCursor: end < rows.length ? encode(end) : null,
  };
}

/** Parses "field:dir" and checks the field against an allow-list. */
export function parseSort(sort, allowed, fallback) {
  if (!sort) return fallback;
  const [field, dir = 'asc'] = sort.split(':');
  if (!allowed.includes(field) || !['asc', 'desc'].includes(dir)) {
    throw new MockApiError(400, 'INVALID_SORT', `Cannot sort by "${sort}"`);
  }
  return { field, dir };
}

export function compareValues(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''), 'en', { numeric: true });
}
