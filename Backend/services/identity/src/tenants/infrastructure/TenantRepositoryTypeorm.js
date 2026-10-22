import { ConflictError } from '@estateops/kernel';
import { pgCode, pgConstraint, updateVersioned } from '@estateops/platform';
import { TenantRow } from './tenantEntity.js';

const toTenant = (row) => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  currency: row.currency,
  locale: row.locale,
  timeZone: row.time_zone,
  areaUnit: row.area_unit,
  version: row.version,
});

export class TenantRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
    this.repo = manager.getRepository(TenantRow);
  }

  async insert(tenant) {
    try {
      await this.repo.insert({
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        currency: tenant.currency,
        locale: tenant.locale,
        time_zone: tenant.timeZone,
        area_unit: tenant.areaUnit,
      });
    } catch (error) {
      if (pgCode(error) === '23505' && pgConstraint(error)?.includes('slug')) {
        throw new ConflictError('SLUG_TAKEN', 'That tenant short name is already used');
      }
      throw error;
    }
    return tenant;
  }

  async findById(id) {
    const row = await this.repo.findOneBy({ id });
    return row ? toTenant(row) : null;
  }

  async findBySlug(slug) {
    const row = await this.repo
      .createQueryBuilder('t')
      .where('lower(t.slug) = lower(:slug)', { slug })
      .getOne();
    return row ? toTenant(row) : null;
  }

  async update(tenant) {
    const version = await updateVersioned(this.manager, TenantRow, {
      where: { id: tenant.id },
      version: tenant.version,
      set: {
        name: tenant.name,
        locale: tenant.locale,
        time_zone: tenant.timeZone,
        area_unit: tenant.areaUnit,
      },
    });
    return { ...tenant, version };
  }
}
