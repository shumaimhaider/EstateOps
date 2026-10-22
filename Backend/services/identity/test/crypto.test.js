import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  createTotp,
  totpCode,
} from '../src/auth/infrastructure/totp.js';
import { createScryptHasher } from '../src/users/infrastructure/scryptHasher.js';
import { createTokenService } from '../src/auth/infrastructure/tokens.js';

// RFC 6238 appendix B: secret "12345678901234567890", SHA-1, last 6 digits of the 8 digit codes
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totp', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1234567890, '005924'],
    [20000000000, '353130'],
  ])('matches the RFC 6238 vector at t=%i', (seconds, expected) => {
    expect(totpCode(RFC_SECRET, seconds * 1000)).toBe(expected);
  });

  it('round trips base32 and generates a 32 character secret', () => {
    const bytes = Buffer.from('hello world');
    expect(base32Decode(base32Encode(bytes)).toString()).toBe('hello world');
    expect(createTotp().generateSecret()).toMatch(/^[A-Z2-7]{32}$/);
    expect(() => base32Decode('not*base32')).toThrow();
  });

  it('accepts one step of drift either way and nothing beyond', () => {
    const totp = createTotp();
    const now = new Date('2026-10-21T09:00:10Z');
    const secret = totp.generateSecret();
    expect(totp.verify(secret, totp.code(secret, now), now)).toBe(true);
    expect(totp.verify(secret, totp.code(secret, new Date(now.getTime() - 30_000)), now)).toBe(
      true,
    );
    expect(totp.verify(secret, totp.code(secret, new Date(now.getTime() + 30_000)), now)).toBe(
      true,
    );
    expect(totp.verify(secret, totp.code(secret, new Date(now.getTime() + 90_000)), now)).toBe(
      false,
    );
    expect(totp.verify(secret, 'abcdef', now)).toBe(false);
    expect(totp.verify(secret, '12345', now)).toBe(false);
  });
});

describe('password hasher', () => {
  const hasher = createScryptHasher({ N: 2 ** 8 });
  it('hashes with a fresh salt each time and verifies only the right password', async () => {
    const a = await hasher.hash('Passw0rd!');
    const b = await hasher.hash('Passw0rd!');
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$256$8$1$')).toBe(true);
    expect(await hasher.verify('Passw0rd!', a)).toBe(true);
    expect(await hasher.verify('passw0rd!', a)).toBe(false);
    expect(await hasher.verify('x', 'garbage')).toBe(false);
  });
  it('has a valid dummy hash so unknown emails cost the same as wrong passwords', async () => {
    expect(await hasher.verify('anything', hasher.dummyHash)).toBe(false);
  });
});

describe('tokens', () => {
  it('makes unguessable refresh tokens and stores only their hash', () => {
    const tokens = createTokenService();
    const a = tokens.newRefreshToken();
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(a).not.toBe(tokens.newRefreshToken());
    expect(tokens.hash(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens.hash(a)).toBe(tokens.hash(a));
  });
});
