import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { layoutProject } from '../domain/layout.js';

/** Recomputes the site plan of a project from its blocks, floors and units. */
export class LayoutProject {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.INVENTORY_MANAGE);
    return this.uow.run(async (repos) => {
      const project = await repos.projects.findById(actor.tenantId, id);
      if (!project) throw new NotFoundError('Project not found');
      const blocks = await repos.structure.listBlocks(actor.tenantId, id);
      const floors = await repos.structure.listFloorsOfProject(actor.tenantId, id);
      const units = await repos.units.listForLayout(actor.tenantId, id);
      const unitsByBlock = new Map();
      for (const unit of units) {
        if (!unit.blockId) continue;
        if (!unitsByBlock.has(unit.blockId)) unitsByBlock.set(unit.blockId, []);
        unitsByBlock.get(unit.blockId).push(unit);
      }
      const result = layoutProject(blocks, unitsByBlock, new Map(floors.map((f) => [f.id, f])));
      await repos.structure.saveBlockGeometry(actor.tenantId, result.blocks);
      await repos.units.saveGeometry(actor.tenantId, result.units);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'project.layout',
        subjectType: 'project',
        subjectId: id,
        after: { blocks: result.blocks.length, units: result.units.length },
      });
      return { blocks: result.blocks.length, units: result.units.length };
    });
  }
}
