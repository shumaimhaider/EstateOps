import { consumeOnce } from '@estateops/kernel';

/** Event unit.upserted: keep the local unit snapshot and the names stored on its bookings. */
export class ApplyUnit {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute(event) {
    const d = event.data;
    return this.uow.run((repos) =>
      consumeOnce(repos, event, async () => {
        const written = await repos.unitRefs.upsert(
          {
            unitId: d.unit_id,
            tenantId: event.tenant_id,
            projectId: d.project_id,
            projectName: d.project_name,
            unitNo: d.unit_no,
            kind: d.kind,
            status: d.status,
            listPrice: d.list_price,
            currency: d.currency,
          },
          event.occurred_at,
        );
        if (written)
          await repos.bookings.refreshUnitNames(event.tenant_id, d.unit_id, {
            unitNo: d.unit_no,
            projectName: d.project_name,
          });
      }),
    );
  }
}
