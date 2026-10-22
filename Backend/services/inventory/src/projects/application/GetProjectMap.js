import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { MAP_HEIGHT, MAP_WIDTH } from '../../layout/domain/layout.js';

/** Site plan: block outlines plus one shape per unit coloured by live status. */
export class GetProjectMap {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.PROJECTS_VIEW);
    return this.uow.read(async (repos) => {
      const project = await repos.projects.findById(actor.tenantId, id);
      if (!project) throw new NotFoundError('Project not found');
      const blocks = await repos.structure.listBlocks(actor.tenantId, id);
      const shapes = await repos.units.listShapes(actor.tenantId, id);
      return {
        project,
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
        blocks: blocks.filter((b) => b.geometry),
        shapes,
      };
    });
  }
}
