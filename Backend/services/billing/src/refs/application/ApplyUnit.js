import { consumeOnce } from '@estateops/kernel';

/** Event unit.upserted: keep the unit snapshot that fine-rate targets and stats read. */
export class ApplyUnit {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute(event) {
    const d = event.data;
    return this.uow.run((repos) =>
      consumeOnce(repos, event, () =>
        repos.unitRefs.upsert(
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
        ),
      ),
    );
  }
}
