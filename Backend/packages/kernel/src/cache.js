/**
 * The cache as the application layer sees it. `remember({ ns, tenantId, key, ttlMs }, loader)`
 * returns a cached value or the loader's result; `bump(ns, tenantId)` invalidates a tenant's
 * namespace. Use cases take any object with these two methods; `noCache` is the do-nothing one.
 */
export const noCache = Object.freeze({
  remember: (_options, loader) => loader(),
  bump: async () => null,
});

/** A short stable fingerprint of what a role may do, for cache keys of role-dependent answers. */
export function permissionFingerprint(permissions) {
  const text = [...permissions].sort().join(',');
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
