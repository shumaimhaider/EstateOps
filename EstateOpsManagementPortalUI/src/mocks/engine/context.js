import { MockApiError } from './errors.js';

/**
 * Resolves the acting tenant and user from the bearer token (`mock.<tenantSlug>.<role>`).
 * A missing or malformed token is a 401, as with the real API.
 */
export function resolveContext(db, authorization) {
  const match = /^Bearer mock\.([a-z]+)\.([a-z_]+)$/.exec(authorization ?? '');
  if (!match) throw new MockApiError(401, 'UNAUTHENTICATED', 'Sign in to continue');
  const [, slug, role] = match;
  const tenant = db.tenants.find((t) => t.slug === slug);
  const user = tenant && db.users.find((u) => u.tenant_id === tenant.id && u.role === role);
  if (!user) throw new MockApiError(401, 'UNAUTHENTICATED', 'Invalid or expired token');
  return { tenant, user: { id: user.id, name: user.name, tenantId: tenant.id, role: user.role } };
}

/** Test/dev helper: an access token for a seeded tenant + role. */
export function mockToken(slug = 'pk', role = 'owner') {
  return `mock.${slug}.${role}`;
}
