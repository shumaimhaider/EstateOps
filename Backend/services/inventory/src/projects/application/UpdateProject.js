import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { updateProject } from '../domain/project.js';
import { projectUpserted } from './events.js';

export class UpdateProject {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, id, patch }) {
    assertCan(actor, PERMISSION.INVENTORY_MANAGE);
    return this.uow.run(async (repos) => {
      const current = await repos.projects.findById(actor.tenantId, id);
      if (!current) throw new NotFoundError('Project not found');
      const next = updateProject(current, patch);
      if (next.name.toLowerCase() !== current.name.toLowerCase()) {
        if (await repos.projects.findByName(actor.tenantId, next.name)) {
          throw new ConflictError('PROJECT_NAME_TAKEN', 'A project with this name already exists');
        }
      }
      const saved = await repos.projects.update(next);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'project.update',
        subjectType: 'project',
        subjectId: id,
        before: { name: current.name, location: current.location, kind: current.kind },
        after: { name: saved.name, location: saved.location, kind: saved.kind },
      });
      await repos.outbox.add(projectUpserted(saved, this.clock.now()));
      return saved;
    });
  }
}
