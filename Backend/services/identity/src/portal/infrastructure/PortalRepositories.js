import { ConflictError } from '@estateops/kernel';
import { pgCode, rowsOf } from '@estateops/platform';

const UUID = /^[0-9a-f-]{36}$/i;
const toAccount = (r) =>
  r && {
    id: r.id,
    tenantId: r.tenant_id,
    customerId: r.customer_id,
    email: r.email,
    fullName: r.full_name,
    passwordHash: r.password_hash,
    status: r.status,
    invitedAt: r.invited_at,
    lastLoginAt: r.last_login_at,
    passwordChangedAt: r.password_changed_at,
    sourceAt: r.source_at,
  };

export class CustomerAccountRepository {
  constructor(manager) {
    this.manager = manager;
  }

  async insert(a, sourceAt) {
    try {
      await this.manager.query(
        `INSERT INTO identity.customer_account (id, tenant_id, customer_id, email, full_name, password_hash, status, invited_at, source_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          a.id,
          a.tenantId,
          a.customerId,
          a.email,
          a.fullName,
          a.passwordHash,
          a.status,
          a.invitedAt,
          sourceAt,
        ],
      );
    } catch (error) {
      if (pgCode(error) === '23505')
        throw new ConflictError(
          'PORTAL_EMAIL_TAKEN',
          'Another customer already uses this email for the portal',
        );
      throw error;
    }
    return a;
  }

  async findById(tenantId, id, { lock = false } = {}) {
    if (!UUID.test(String(id))) return null;
    const rows = await this.manager.query(
      `SELECT * FROM identity.customer_account WHERE tenant_id = $1 AND id = $2 ${lock ? 'FOR UPDATE' : ''}`,
      [tenantId, id],
    );
    return toAccount(rows[0]);
  }

  async findByCustomer(tenantId, customerId, { lock = false } = {}) {
    const rows = await this.manager.query(
      `SELECT * FROM identity.customer_account WHERE tenant_id = $1 AND customer_id = $2 ${lock ? 'FOR UPDATE' : ''}`,
      [tenantId, customerId],
    );
    return toAccount(rows[0]);
  }

  async findByEmail(tenantId, email) {
    const rows = await this.manager.query(
      'SELECT * FROM identity.customer_account WHERE tenant_id = $1 AND email = $2',
      [tenantId, email],
    );
    return toAccount(rows[0]);
  }

  /** Name and email follow the customer record; an older event never overwrites a newer one. */
  async applyProfile(id, { email, fullName }, sourceAt) {
    try {
      const rows = rowsOf(
        await this.manager.query(
          `UPDATE identity.customer_account SET email = $2, full_name = $3, source_at = $4, updated_at = now()
            WHERE id = $1 AND source_at <= $4 RETURNING id`,
          [id, email, fullName, sourceAt],
        ),
      );
      return rows.length === 1;
    } catch (error) {
      if (pgCode(error) === '23505')
        throw new ConflictError(
          'PORTAL_EMAIL_TAKEN',
          'Another customer already uses this email for the portal',
        );
      throw error;
    }
  }

  async setPassword(id, passwordHash, now) {
    await this.manager.query(
      `UPDATE identity.customer_account
          SET password_hash = $2, password_changed_at = $3, updated_at = now(),
              status = CASE WHEN status = 'disabled' THEN 'disabled' ELSE 'active' END
        WHERE id = $1`,
      [id, passwordHash, now],
    );
  }

  async setStatus(id, status) {
    await this.manager.query(
      'UPDATE identity.customer_account SET status = $2, updated_at = now() WHERE id = $1',
      [id, status],
    );
  }

  async touchLogin(id, now) {
    await this.manager.query(
      'UPDATE identity.customer_account SET last_login_at = $2 WHERE id = $1',
      [id, now],
    );
  }

  async markInvited(id, now) {
    await this.manager.query('UPDATE identity.customer_account SET invited_at = $2 WHERE id = $1', [
      id,
      now,
    ]);
  }
}

export class AccountTokenRepository {
  constructor(manager) {
    this.manager = manager;
  }

  async insert({ id, tenantId, accountId, purpose, tokenHash, expiresAt }) {
    await this.manager.query(
      `INSERT INTO identity.account_token (id, tenant_id, account_id, purpose, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, tenantId, accountId, purpose, tokenHash, expiresAt],
    );
  }

  async findByHash(tokenHash) {
    const rows = await this.manager.query(
      'SELECT * FROM identity.account_token WHERE token_hash = $1',
      [tokenHash],
    );
    const r = rows[0];
    return (
      r && {
        id: r.id,
        tenantId: r.tenant_id,
        accountId: r.account_id,
        purpose: r.purpose,
        expiresAt: r.expires_at,
        usedAt: r.used_at,
      }
    );
  }

  /** True only for the first caller: a link works once. */
  async markUsed(id, now) {
    return (
      rowsOf(
        await this.manager.query(
          'UPDATE identity.account_token SET used_at = $2 WHERE id = $1 AND used_at IS NULL RETURNING id',
          [id, now],
        ),
      ).length === 1
    );
  }

  /** A newer link replaces older ones: every unused link of the account is closed. */
  async closeOpen(accountId, now) {
    await this.manager.query(
      'UPDATE identity.account_token SET used_at = $2 WHERE account_id = $1 AND used_at IS NULL',
      [accountId, now],
    );
  }

  async countSince(accountId, since) {
    const rows = await this.manager.query(
      'SELECT count(*)::int AS n FROM identity.account_token WHERE account_id = $1 AND created_at >= $2',
      [accountId, since],
    );
    return rows[0].n;
  }
}

export class CustomerRefreshTokenRepository {
  constructor(manager) {
    this.manager = manager;
  }

  async insert({ id, tenantId, accountId, tokenHash, expiresAt }) {
    await this.manager.query(
      'INSERT INTO identity.customer_refresh_token (id, tenant_id, account_id, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [id, tenantId, accountId, tokenHash, expiresAt],
    );
  }

  async findByHash(tokenHash) {
    const rows = await this.manager.query(
      'SELECT * FROM identity.customer_refresh_token WHERE token_hash = $1',
      [tokenHash],
    );
    const r = rows[0];
    return (
      r && {
        id: r.id,
        tenantId: r.tenant_id,
        accountId: r.account_id,
        expiresAt: r.expires_at,
        usedAt: r.used_at,
      }
    );
  }

  async markUsed(id, now) {
    return (
      rowsOf(
        await this.manager.query(
          'UPDATE identity.customer_refresh_token SET used_at = $2 WHERE id = $1 AND used_at IS NULL RETURNING id',
          [id, now],
        ),
      ).length === 1
    );
  }

  async revokeByHash(tokenHash) {
    await this.manager.query('DELETE FROM identity.customer_refresh_token WHERE token_hash = $1', [
      tokenHash,
    ]);
  }

  async revokeAllForAccount(accountId) {
    await this.manager.query('DELETE FROM identity.customer_refresh_token WHERE account_id = $1', [
      accountId,
    ]);
  }
}

export class CustomerLoginHistoryRepository {
  constructor(manager) {
    this.manager = manager;
  }

  async record({ id, tenantId, accountId, event, ip }) {
    await this.manager.query(
      'INSERT INTO identity.customer_login_history (id, tenant_id, account_id, event, ip) VALUES ($1, $2, $3, $4, $5)',
      [id, tenantId, accountId, event, ip ?? null],
    );
  }
}
