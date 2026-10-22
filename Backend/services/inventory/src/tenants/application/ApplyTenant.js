import { consumeOnce } from '@estateops/kernel';

/** Event tenant.upserted: keep a local copy of the tenant's currency and area unit. */
export class ApplyTenant {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute(event) {
    return this.uow.run((repos) =>
      consumeOnce(repos, event, () =>
        repos.tenantRefs.upsert(
          {
            tenantId: event.tenant_id,
            slug: event.data.slug,
            name: event.data.name,
            currency: event.data.currency,
            locale: event.data.locale,
            timeZone: event.data.time_zone,
            areaUnit: event.data.area_unit,
          },
          event.occurred_at,
        ),
      ),
    );
  }
}
