import { newId } from '@estateops/kernel';
import { rowsOf } from '@estateops/platform';

/** Sign-in state: challenges, refresh tokens and the login history that drives lockout. */
export class MfaChallengeRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  async insert({ id, tenantId, userId, expiresAt }) {
    await this.manager.query(
      'INSERT INTO identity.mfa_challenge (id, tenant_id, user_id, expires_at) VALUES ($1, $2, $3, $4)',
      [id, tenantId, userId, expiresAt],
    );
  }

  async findById(id) {
    if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
    const rows = await this.manager.query('SELECT * FROM identity.mfa_challenge WHERE id = $1', [
      id,
    ]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      tenantId: r.tenant_id,
      userId: r.user_id,
      expiresAt: r.expires_at,
      usedAt: r.used_at,
    };
  }

  /** True only for the first caller: a challenge cannot be consumed twice. */
  async markUsed(id, now) {
    const rows = rowsOf(
      await this.manager.query(
        'UPDATE identity.mfa_challenge SET used_at = $2 WHERE id = $1 AND used_at IS NULL RETURNING id',
        [id, now],
      ),
    );
    return rows.length === 1;
  }
}

export class RefreshTokenRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  async insert({ id, tenantId, userId, tokenHash, expiresAt }) {
    await this.manager.query(
      'INSERT INTO identity.refresh_token (id, tenant_id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [id, tenantId, userId, tokenHash, expiresAt],
    );
  }

  async findByHash(tokenHash) {
    const rows = await this.manager.query(
      'SELECT * FROM identity.refresh_token WHERE token_hash = $1',
      [tokenHash],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      tenantId: r.tenant_id,
      userId: r.user_id,
      expiresAt: r.expires_at,
      usedAt: r.used_at,
    };
  }

  async markUsed(id, now) {
    const rows = rowsOf(
      await this.manager.query(
        'UPDATE identity.refresh_token SET used_at = $2 WHERE id = $1 AND used_at IS NULL RETURNING id',
        [id, now],
      ),
    );
    return rows.length === 1;
  }

  async revokeByHash(tokenHash) {
    await this.manager.query(
      'UPDATE identity.refresh_token SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL',
      [tokenHash],
    );
  }

  async revokeAllForUser(userId) {
    await this.manager.query(
      'UPDATE identity.refresh_token SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
      [userId],
    );
  }
}

export class LoginHistoryRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  async record({ tenantId, userId, method, success, ip }) {
    await this.manager.query(
      'INSERT INTO identity.login_history (id, tenant_id, user_id, method, success, ip) VALUES ($1, $2, $3, $4, $5, $6)',
      [newId(), tenantId, userId, method, success, ip ?? null],
    );
  }

  async countFailures(userId, method, since) {
    const rows = await this.manager.query(
      `SELECT count(*)::int AS n FROM identity.login_history
        WHERE user_id = $1 AND method = $2 AND success = false AND created_at >= $3`,
      [userId, method, since],
    );
    return rows[0].n;
  }
}
