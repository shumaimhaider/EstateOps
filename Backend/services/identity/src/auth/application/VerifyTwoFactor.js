import { RateLimitedError, UnauthenticatedError, fieldError } from '@estateops/kernel';
import { MAX_FAILED_ATTEMPTS, isExpired, windowStart } from '../domain/session.js';
import { issueSession } from './issueSession.js';

const startAgain = () => new UnauthenticatedError('INVALID_MFA_TOKEN', 'Start sign-in again');

/**
 * Step two of sign-in: the 6 digit code from the authenticator app. A challenge works once.
 * A wrong code is recorded in its own transaction (so it survives the error and counts toward the
 * lockout); success consumes the challenge and issues the session in one transaction.
 * input: { mfaToken, code, ip } -> { accessToken, refreshToken, user, tenant }
 */
export class VerifyTwoFactor {
  constructor({ uow, totp, signer, tokens, clock }) {
    Object.assign(this, { uow, totp, signer, tokens, clock });
  }

  async execute({ mfaToken, code, ip }) {
    const now = this.clock.now();
    const { challenge, user, failures } = await this.uow.read(async (repos) => {
      const found = await repos.mfaChallenges.findById(mfaToken);
      if (!found || found.usedAt || isExpired(found.expiresAt, now)) return {};
      const owner = await repos.users.findById(found.tenantId, found.userId);
      const count = owner
        ? await repos.loginHistory.countFailures(owner.id, '2fa', windowStart(now))
        : 0;
      return { challenge: found, user: owner, failures: count };
    });
    if (!challenge || !user || !user.active) throw startAgain();
    if (failures >= MAX_FAILED_ATTEMPTS) throw new RateLimitedError();

    if (!this.totp.verify(user.totpSecret, String(code ?? ''), now)) {
      await this.uow.run((repos) =>
        repos.loginHistory.record({
          tenantId: user.tenantId,
          userId: user.id,
          method: '2fa',
          success: false,
          ip,
        }),
      );
      throw fieldError('code', 'That code is not valid');
    }

    return this.uow.run(async (repos) => {
      // conditional update: two parallel requests cannot both consume the same challenge
      if (!(await repos.mfaChallenges.markUsed(challenge.id, now))) throw startAgain();
      await repos.loginHistory.record({
        tenantId: user.tenantId,
        userId: user.id,
        method: '2fa',
        success: true,
        ip,
      });
      const tenant = await repos.tenants.findById(user.tenantId);
      return issueSession({ repos, user, tenant, signer: this.signer, tokens: this.tokens, now });
    });
  }
}
