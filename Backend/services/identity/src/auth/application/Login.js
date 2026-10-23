import { RateLimitedError, UnauthenticatedError } from '@estateops/kernel';
import { normalizeEmail } from '../../users/domain/user.js';
import { MAX_FAILED_ATTEMPTS, MFA_TTL_MS, expiresIn, windowStart } from '../domain/session.js';

/**
 * Step one of sign-in: email and password. On success a short-lived challenge is returned and
 * the verification code is asked for next. Wrong credentials never say which part was wrong.
 * input: { email, password, ip } -> { mfaToken }
 */
export class Login {
  constructor({ uow, hasher, tokens, clock, throttle = null }) {
    Object.assign(this, { uow, hasher, tokens, clock, throttle });
  }

  async execute({ email, password, ip }) {
    await this.throttle?.assertAllowed({ email, ip });
    try {
      const result = await this.#signIn({ email, password, ip });
      await this.throttle?.succeeded({ email, ip });
      return result;
    } catch (error) {
      if (error?.code === 'INVALID_CREDENTIALS') await this.throttle?.failed({ email, ip });
      throw error;
    }
  }

  async #signIn({ email, password, ip }) {
    const now = this.clock.now();
    const user = await this.uow.read((repos) => repos.users.findByEmail(normalizeEmail(email)));
    const invalid = new UnauthenticatedError(
      'INVALID_CREDENTIALS',
      'Email or password is incorrect',
    );
    if (!user) {
      // same work as a real check, so timing does not reveal whether the email exists
      await this.hasher.verify(String(password ?? ''), this.hasher.dummyHash);
      throw invalid;
    }

    const failures = await this.uow.read((repos) =>
      repos.loginHistory.countFailures(user.id, 'password', windowStart(now)),
    );
    if (failures >= MAX_FAILED_ATTEMPTS) throw new RateLimitedError();

    const good =
      (await this.hasher.verify(String(password ?? ''), user.passwordHash)) && user.active;
    if (!good) {
      await this.uow.run((repos) =>
        repos.loginHistory.record({
          tenantId: user.tenantId,
          userId: user.id,
          method: 'password',
          success: false,
          ip,
        }),
      );
      throw invalid;
    }

    const id = this.tokens.newId();
    await this.uow.run((repos) =>
      repos.mfaChallenges.insert({
        id,
        tenantId: user.tenantId,
        userId: user.id,
        expiresAt: expiresIn(MFA_TTL_MS, now),
      }),
    );
    return { mfaToken: id };
  }
}
