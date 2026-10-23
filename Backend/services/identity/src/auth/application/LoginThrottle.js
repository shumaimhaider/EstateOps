import { RateLimitedError } from '@estateops/kernel';

/**
 * Slows down password guessing before any database or hashing work is done. Failed sign-ins are
 * counted per email address and per network address in Redis (shared by every replica), so it
 * also covers addresses that do not exist and a guesser who moves between accounts. The
 * database-backed per-user limit in Login stays as the second line. With Redis out, nothing
 * is blocked here.
 */
export class LoginThrottle {
  constructor({
    cache,
    scope = 'login',
    maxPerEmail = 10,
    maxPerAddress = 40,
    windowMs = 15 * 60_000,
  }) {
    Object.assign(this, { cache, scope, maxPerEmail, maxPerAddress, windowMs });
  }

  keys({ email, ip }) {
    return {
      email: `${this.scope}:email:${String(email ?? '')
        .trim()
        .toLowerCase()}`,
      address: `${this.scope}:ip:${ip ?? 'unknown'}`,
    };
  }

  async assertAllowed(who) {
    if (!this.cache) return;
    const k = this.keys(who);
    const [emailFails, addressFails] = await Promise.all([
      this.cache.count(k.email),
      this.cache.count(k.address),
    ]);
    if (emailFails >= this.maxPerEmail || addressFails >= this.maxPerAddress)
      throw new RateLimitedError();
  }

  async failed(who) {
    if (!this.cache) return;
    const k = this.keys(who);
    await Promise.all([
      this.cache.hit(k.email, this.windowMs),
      this.cache.hit(k.address, this.windowMs),
    ]);
  }

  /** A correct password clears that account's count (the address count keeps its own window). */
  async succeeded(who) {
    if (!this.cache) return;
    await this.cache.clear(this.keys(who).email);
  }
}
