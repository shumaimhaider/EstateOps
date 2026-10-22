/**
 * Which service answers which path. The first matching rule wins, so the narrower contract routes
 * under /bookings come before /bookings itself. Everything is under /api/v1/admin.
 */
export const API_PREFIX = '/api/v1/admin';

const prefix = (name) => new RegExp(`^${API_PREFIX}/${name}(/|\\?|$)`);

export const ROUTES = Object.freeze([
  { service: 'contract', match: new RegExp(`^${API_PREFIX}/bookings/[^/]+/contracts(/|\\?|$)`) },
  { service: 'contract', match: prefix('contracts') },
  { service: 'contract', match: prefix('mock/contracts') },
  { service: 'billing', match: prefix('mock/payment-intents') },
  ...['auth', 'users', 'permissions', 'tenant'].map((n) => ({
    service: 'identity',
    match: prefix(n),
  })),
  ...['projects', 'units', 'phases', 'blocks', 'floors'].map((n) => ({
    service: 'inventory',
    match: prefix(n),
  })),
  { service: 'customer', match: prefix('customers') },
  ...['payment-plans', 'bookings'].map((n) => ({ service: 'sales', match: prefix(n) })),
  ...['installments', 'fine-rules', 'escalations', 'stats', 'collection-settings'].map((n) => ({
    service: 'billing',
    match: prefix(n),
  })),
]);

/** Sign-in and token renewal need no token. Everything else does. */
export const PUBLIC_PATHS = Object.freeze(
  ['/auth/login', '/auth/2fa', '/auth/refresh', '/auth/logout'].map((p) => `${API_PREFIX}${p}`),
);

export const isPublic = (path) => PUBLIC_PATHS.includes(path.split('?')[0]);

/** The service for a request path, or null for an unknown path. Internal routes are never routed. */
export function resolveService(path) {
  return ROUTES.find((r) => r.match.test(path))?.service ?? null;
}
