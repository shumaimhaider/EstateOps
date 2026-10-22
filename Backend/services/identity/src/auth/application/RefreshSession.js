import { UnauthenticatedError } from '@estateops/kernel';
import { isExpired } from '../domain/session.js';
import { issueSession } from './issueSession.js';

const expired = () => new UnauthenticatedError('INVALID_REFRESH_TOKEN', 'Session expired');

/**
 * Trades a refresh token for a new access token and a new refresh token. Each refresh token works
 * once; presenting a used one means it leaked, so every session of that person is ended.
 * input: { refreshToken } -> { accessToken, refreshToken }
 */
export class RefreshSession {
  constructor({ uow, signer, tokens, clock }) {
    Object.assign(this, { uow, signer, tokens, clock });
  }

  async execute({ refreshToken }) {
    const now = this.clock.now();
    const hash = this.tokens.hash(String(refreshToken ?? ''));
    const found = await this.uow.read((repos) => repos.refreshTokens.findByHash(hash));
    if (!found || isExpired(found.expiresAt, now)) throw expired();

    if (found.usedAt) {
      // reuse: end all sessions in their own transaction so this survives the error below
      await this.uow.run((repos) => repos.refreshTokens.revokeAllForUser(found.userId));
      throw expired();
    }

    return this.uow.run(async (repos) => {
      if (!(await repos.refreshTokens.markUsed(found.id, now))) throw expired();
      const user = await repos.users.findById(found.tenantId, found.userId);
      if (!user || !user.active) throw expired();
      const tenant = await repos.tenants.findById(user.tenantId);
      const session = await issueSession({
        repos,
        user,
        tenant,
        signer: this.signer,
        tokens: this.tokens,
        now,
      });
      return { accessToken: session.accessToken, refreshToken: session.refreshToken };
    });
  }
}
