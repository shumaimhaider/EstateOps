import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, newId } from '@estateops/kernel';
import { createJwtSigner, createJwtVerifier } from '../auth/jwt.js';
import { generateTestKeys } from './keys.js';

export const TEST_TENANT_A = '00000000-0000-4000-8000-0000000000a1';
export const TEST_TENANT_B = '00000000-0000-4000-8000-0000000000b2';
export const TEST_INTERNAL_TOKEN = 'test-internal-token';

/**
 * Real JWT verification with a throwaway key pair, so controller tests exercise the same
 * authentication path as production. `tokenFor` signs a token for any role in any tenant.
 */
export async function createTestAuth({ fresh = false } = {}) {
  const keys = await generateTestKeys({ fresh });
  const signer = await createJwtSigner({ privateKeyPem: keys.privatePem });
  const verifier = await createJwtVerifier({ publicKeyPem: keys.publicPem });
  return {
    keys,
    verifier,
    signer,
    async tokenFor({
      role = 'owner',
      tenantId = TEST_TENANT_A,
      permissions,
      userId = newId(),
      name = 'Test User',
      kind,
      customerId,
    } = {}) {
      return signer.sign({
        kind,
        customerId,
        sub: userId,
        tenantId,
        role,
        name,
        permissions: permissions ?? DEFAULT_ROLE_PERMISSIONS[role] ?? ALL_PERMISSIONS,
      });
    },
    /** A customer-portal sign-in: a token of kind 'customer' that names the customer it is for. */
    async customerBearer({
      customerId,
      tenantId = TEST_TENANT_A,
      name = 'Test Customer',
      accountId = newId(),
    } = {}) {
      return {
        Authorization: `Bearer ${await signer.sign({
          sub: accountId,
          tenantId,
          role: 'customer',
          name,
          permissions: [],
          kind: 'customer',
          customerId,
        })}`,
      };
    },
    /** `{ Authorization }` header object for supertest `.set()`. */
    async bearer(options) {
      return { Authorization: `Bearer ${await this.tokenFor(options)}` };
    },
  };
}
