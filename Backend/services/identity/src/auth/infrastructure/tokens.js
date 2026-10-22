import { createHash, randomBytes } from 'node:crypto';
import { newId } from '@estateops/kernel';

/** Refresh tokens are random, shown once, and stored only as a SHA-256 hash. */
export const createTokenService = () => ({
  newId,
  newRefreshToken: () => randomBytes(32).toString('base64url'),
  hash: (token) => createHash('sha256').update(token).digest('hex'),
});
