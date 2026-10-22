import { randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 32;

/**
 * Password hashing with node's scrypt: per-password salt, constant-time compare. The cost is a
 * parameter so tests can use a cheap one. Format: scrypt$N$r$p$salt$hash.
 */
export function createScryptHasher({ N = 2 ** 15, r = 8, p = 1 } = {}) {
  const maxmem = 256 * N * r;
  const derive = (password, salt) => scryptAsync(password, salt, KEY_LENGTH, { N, r, p, maxmem });

  const hasher = {
    async hash(password) {
      const salt = randomBytes(16);
      const key = await derive(password, salt);
      return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
    },
    async verify(password, stored) {
      const [scheme, n, rr, pp, saltB64, keyB64] = String(stored).split('$');
      if (scheme !== 'scrypt') return false;
      const expected = Buffer.from(keyB64, 'base64');
      const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length, {
        N: Number(n),
        r: Number(rr),
        p: Number(pp),
        maxmem: 256 * Number(n) * Number(rr),
      });
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    },
  };
  // A valid hash of a random value, so unknown emails cost the same as a wrong password.
  const salt = randomBytes(16);
  const key = scryptSync(randomBytes(16), salt, KEY_LENGTH, { N, r, p, maxmem });
  hasher.dummyHash = `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
  return hasher;
}
