import { ConflictError } from '@estateops/kernel';
import { keysetPage, pgCode, updateVersioned } from '@estateops/platform';
import { UserRow } from './userEntity.js';

const toUser = (row) => ({
  id: row.id,
  tenantId: row.tenant_id,
  email: row.email,
  name: row.name,
  role: row.role,
  passwordHash: row.password_hash,
  totpSecret: row.totp_secret,
  active: row.active,
  createdAt: row.created_at,
  version: row.version,
});

export class UserRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
    this.repo = manager.getRepository(UserRow);
  }

  async insert(user) {
    try {
      await this.repo.insert({
        id: user.id,
        tenant_id: user.tenantId,
        email: user.email,
        name: user.name,
        role: user.role,
        password_hash: user.passwordHash,
        totp_secret: user.totpSecret,
        active: user.active,
      });
    } catch (error) {
      if (pgCode(error) === '23505')
        throw new ConflictError('EMAIL_TAKEN', 'That email already has an account');
      throw error;
    }
    // the database fills created_at: hand back the row as stored
    return (await this.findById(user.tenantId, user.id)) ?? user;
  }

  /** Sign-in is by email alone, so lookup is across tenants (the email is globally unique). */
  async findByEmail(email) {
    const row = await this.repo
      .createQueryBuilder('u')
      .where('lower(u.email) = lower(:email)', { email })
      .getOne();
    return row ? toUser(row) : null;
  }

  async findById(tenantId, id) {
    const row = await this.repo.findOneBy({ id, tenant_id: tenantId });
    return row ? toUser(row) : null;
  }

  async list(tenantId, { q, role, cursor, limit }) {
    const qb = this.repo.createQueryBuilder('u').where('u.tenant_id = :tenantId', { tenantId });
    if (role) qb.andWhere('u.role = :role', { role });
    if (q)
      qb.andWhere('(u.name ILIKE :q OR u.email ILIKE :q)', {
        q: `%${q.replace(/[%_]/g, '\\$&')}%`,
      });
    const page = await keysetPage({
      qb,
      sort: { expr: 'lower(u.name)', dir: 'asc', cast: 'text' },
      idExpr: 'u.id',
      cursor,
      limit,
      valueOf: (row) => row.name.toLowerCase(),
      idOf: (row) => row.id,
    });
    return { items: page.rows.map(toUser), nextCursor: page.nextCursor };
  }

  async countActiveOwners(tenantId) {
    return this.repo.countBy({ tenant_id: tenantId, role: 'owner', active: true });
  }

  async update(user) {
    const version = await updateVersioned(this.manager, UserRow, {
      where: { id: user.id, tenant_id: user.tenantId },
      version: user.version,
      set: {
        name: user.name,
        role: user.role,
        active: user.active,
        password_hash: user.passwordHash,
      },
    });
    return { ...user, version };
  }
}
