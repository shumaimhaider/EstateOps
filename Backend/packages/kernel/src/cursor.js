import { ValidationError } from './errors.js';

/** Opaque keyset cursors: the last row's sort value and id, base64url encoded. */
export const encodeCursor = (payload) =>
  Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

export function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (parsed && typeof parsed === 'object' && 'id' in parsed) return parsed;
  } catch {
    /* falls through to the error below */
  }
  throw new ValidationError('The pagination cursor is not valid', [
    { field: 'cursor', message: 'Invalid cursor' },
  ]);
}

export const clampLimit = (limit, { fallback = 25, max = 200 } = {}) => {
  const n = Number(limit);
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), max) : fallback;
};

/** Parses "field:dir" and checks the field against an allow-list. */
export function parseSort(sort, allowed, fallback) {
  if (!sort) return fallback;
  const [field, dir = 'asc'] = String(sort).split(':');
  if (!allowed.includes(field) || !['asc', 'desc'].includes(dir)) {
    throw new ValidationError('The sort is not valid', [
      { field: 'sort', message: `Cannot sort by "${sort}"` },
    ]);
  }
  return { field, dir };
}
