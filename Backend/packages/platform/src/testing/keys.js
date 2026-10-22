import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';

let cached = null;

const generate = () =>
  generateKeyPair('RS256', { extractable: true }).then(async ({ publicKey, privateKey }) => ({
    publicPem: await exportSPKI(publicKey),
    privatePem: await exportPKCS8(privateKey),
  }));

/**
 * An RS256 key pair as PEM, for tests and local development. Generated once per process because
 * RSA generation is slow; pass `fresh: true` for a different pair (to prove a forged token fails).
 */
export function generateTestKeys({ fresh = false } = {}) {
  if (fresh) return generate();
  cached ??= generate();
  return cached;
}
