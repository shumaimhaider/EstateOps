import { consumeOnce } from '@estateops/kernel';

/** Event project.upserted: keep the project's name for fine-rate targets and stats. */
export class ApplyProject {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute(event) {
    return this.uow.run((repos) =>
      consumeOnce(repos, event, () =>
        repos.projectRefs.upsert(
          {
            projectId: event.data.project_id,
            tenantId: event.tenant_id,
            name: event.data.name,
            kind: event.data.kind,
          },
          event.occurred_at,
        ),
      ),
    );
  }
}
