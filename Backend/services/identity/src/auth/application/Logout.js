/** Ends a refresh token. Unknown tokens are ignored: logging out twice is fine. */
export class Logout {
  constructor({ uow, tokens }) {
    Object.assign(this, { uow, tokens });
  }

  async execute({ refreshToken }) {
    if (!refreshToken) return;
    await this.uow.run((repos) =>
      repos.refreshTokens.revokeByHash(this.tokens.hash(String(refreshToken))),
    );
  }
}
