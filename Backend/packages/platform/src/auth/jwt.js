import { SignJWT, importPKCS8, importSPKI, jwtVerify } from 'jose';
import { UnauthenticatedError } from '@estateops/kernel';

const ALG = 'RS256';
const ISSUER = 'estateops-identity';

/** Signs access tokens. Only the identity service holds the private key. */
export async function createJwtSigner({ privateKeyPem, ttlSeconds = 900 }) {
  const key = await importPKCS8(privateKeyPem, ALG);
  return {
    ttlSeconds,
    /** claims: { sub, tenantId, role, name, permissions, kind?, customerId? } (kind 'customer' for portal sign-ins) */
    sign: (claims) =>
      new SignJWT({
        tenant_id: claims.tenantId,
        role: claims.role,
        name: claims.name,
        permissions: claims.permissions,
        kind: claims.kind ?? 'staff',
        ...(claims.customerId && { customer_id: claims.customerId }),
      })
        .setProtectedHeader({ alg: ALG })
        .setSubject(claims.sub)
        .setIssuer(ISSUER)
        .setIssuedAt()
        .setExpirationTime(`${ttlSeconds}s`)
        .sign(key),
  };
}

/** Verifies access tokens locally with the public key, so no service calls identity per request. */
export async function createJwtVerifier({ publicKeyPem }) {
  const key = await importSPKI(publicKeyPem, ALG);
  return {
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key, { issuer: ISSUER, algorithms: [ALG] });
        return {
          userId: payload.sub,
          tenantId: payload.tenant_id,
          role: payload.role,
          name: payload.name,
          permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
          kind: payload.kind ?? 'staff',
          customerId: payload.customer_id ?? null,
        };
      } catch (error) {
        const expired = error?.code === 'ERR_JWT_EXPIRED';
        throw new UnauthenticatedError(
          expired ? 'TOKEN_EXPIRED' : 'UNAUTHENTICATED',
          expired ? 'Your session expired' : 'Invalid or expired token',
        );
      }
    },
  };
}
