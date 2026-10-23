import { ConflictError, PERMISSION, assertCan } from '@estateops/kernel';
import { createProject } from '../domain/project.js';
import { projectUpserted } from './events.js';

/** Adds a project. Needs inventory.manage. input: { actor, name, location, kind } */
export class CreateProject {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, name, location, kind }) {
    assertCan(actor, PERMISSION.INVENTORY_MANAGE);
    const project = createProject({
      tenantId: actor.tenantId,
      name,
      location,
      kind,
      createdBy: actor.userId,
    });
    return this.uow.run(async (repos) => {
      if (await repos.projects.findByName(actor.tenantId, project.name)) {
        throw new ConflictError('PROJECT_NAME_TAKEN', 'A project with this name already exists');
      }
      const stored = await repos.projects.insert(project);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'project.create',
        subjectType: 'project',
        subjectId: project.id,
        after: { name: project.name, kind: project.kind },
      });
      await repos.outbox.add(projectUpserted(project, this.clock.now()));
      return stored;
    });
  }
}
