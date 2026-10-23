/**
 * Which service answers which path. The first matching rule wins, so the narrower contract routes
 * under /bookings come before /bookings itself. Everything is under /api/v1/admin.
 */
export const API_PREFIX = '/api/v1/admin';

const prefix = (name) => new RegExp(`^${API_PREFIX}/${name}(/|\\?|$)`);

const PORTAL = '/api/v1/portal';
const portal = (path) => new RegExp(`^${PORTAL}/${path}(/|\\?|$)`);

export const ROUTES = Object.freeze([
  // ---- the customer portal's own API --------------------------------------------------------
  { service: 'identity', match: portal('auth') },
  { service: 'billing', match: new RegExp(`^${PORTAL}/properties/[^/]+/invoices(/|\\?|$)`) },
  { service: 'contract', match: new RegExp(`^${PORTAL}/properties/[^/]+/contracts(/|\\?|$)`) },
  { service: 'sales', match: portal('properties') },
  ...['invoices', 'checkout-sessions', 'payment-methods', 'transactions'].map((n) => ({
    service: 'billing',
    match: portal(n),
  })),
  { service: 'contract', match: portal('contracts') },
  ...['profile', 'support-requests'].map((n) => ({ service: 'customer', match: portal(n) })),
  // ---- staff API: portal access sits under /customers but belongs to identity; support to customer ----
  {
    service: 'identity',
    match: new RegExp(`^${API_PREFIX}/customers/[^/]+/portal-access(/|\\?|$)`),
  },
  { service: 'customer', match: prefix('support-requests') },
  { service: 'contract', match: new RegExp(`^${API_PREFIX}/bookings/[^/]+/contracts(/|\\?|$)`) },
  { service: 'contract', match: prefix('contracts') },
  { service: 'contract', match: prefix('mock/contracts') },
  // saved cards are billing's even though they sit under /customers
  {
    service: 'billing',
    match: new RegExp(`^${API_PREFIX}/customers/[^/]+/payment-methods(/|\\?|$)`),
  },
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
  ...[
    'installments',
    'checkout-sessions',
    'transactions',
    'fine-rules',
    'escalations',
    'stats',
    'collection-settings',
    'collection-runs',
  ].map((n) => ({
    service: 'billing',
    match: prefix(n),
  })),
]);

/** Sign-in and token renewal need no token. Everything else does. */
export const PUBLIC_PATHS = Object.freeze([
  ...['/auth/login', '/auth/2fa', '/auth/refresh', '/auth/logout'].map((p) => `${API_PREFIX}${p}`),
  // customer portal sign-in and password links
  ...['login', 'refresh', 'logout', 'forgot-password', 'set-password'].map(
    (p) => `${PORTAL}/auth/${p}`,
  ),
]);

export const isPublic = (path) => PUBLIC_PATHS.includes(path.split('?')[0]);

/** The service for a request path, or null for an unknown path. Internal routes are never routed. */
export function resolveService(path) {
  return ROUTES.find((r) => r.match.test(path))?.service ?? null;
}

/** Provider webhooks arrive outside the admin API, unauthenticated; the service checks the signature. */
export const WEBHOOKS = Object.freeze({
  '/webhooks/stripe': 'billing',
  '/webhooks/pandadoc': 'contract',
});
