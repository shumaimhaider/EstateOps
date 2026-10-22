import { consumeOnce } from '@estateops/kernel';

/** Event tenant.upserted: keep the tenant's currency, which customer money is shown in. */
export class ApplyTenant {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute(event) {
    return this.uow.run((repos) =>
      consumeOnce(repos, event, () =>
        repos.tenantRefs.upsert(
          { tenantId: event.tenant_id, currency: event.data.currency },
          event.occurred_at,
        ),
      ),
    );
  }
}
