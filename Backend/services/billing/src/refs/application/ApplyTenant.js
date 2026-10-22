import { consumeOnce } from '@estateops/kernel';
import { createRule } from '../../fines/domain/rule.js';
import { DEFAULT_SETTINGS } from '../../settings/domain/settings.js';

const DEFAULT_FINE_BPS = 200; // 2% of an overdue installment to start

/**
 * Event tenant.upserted: keep the tenant's currency and short name, and the first time a tenant is
 * seen give it the default collection settings and the default fine rate (2%).
 */
export class ApplyTenant {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute(event) {
    return this.uow.run((repos) =>
      consumeOnce(repos, event, async () => {
        const tenantId = event.tenant_id;
        await repos.tenantRefs.upsert(
          {
            tenantId,
            slug: event.data.slug,
            name: event.data.name,
            currency: event.data.currency,
            locale: event.data.locale,
            timeZone: event.data.time_zone,
            areaUnit: event.data.area_unit,
          },
          event.occurred_at,
        );
        await repos.settings.ensure(tenantId, DEFAULT_SETTINGS);
        const rules = await repos.fines.list(tenantId);
        if (!rules.some((r) => r.scope === 'default' && r.unitKind === null)) {
          await repos.fines.insert(
            createRule({
              tenantId,
              scope: 'default',
              scopeId: null,
              unitKind: null,
              kind: 'percent',
              value: DEFAULT_FINE_BPS,
            }),
            'System',
          );
        }
      }),
    );
  }
}
