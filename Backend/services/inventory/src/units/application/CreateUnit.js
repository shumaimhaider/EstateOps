import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { createUnit } from '../domain/unit.js';
import { announceUnit } from './announce.js';

/**
 * Adds a unit to a project. Needs inventory.manage. The price must be in the tenant currency.
 * input: { actor, projectId, fields: { unitNo, kind, areaValue, areaUnit, bedrooms, ... }, placement }
 */
export class CreateUnit {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, projectId, fields, placement = {} }) {
    assertCan(actor, PERMISSION.INVENTORY_MANAGE);
    return this.uow.run(async (repos) => {
      const tenant = await repos.tenantRefs.get(actor.tenantId);
      if (!tenant)
        throw new ConflictError(
          'TENANT_NOT_READY',
          'The tenant has not reached inventory yet. Try again shortly.',
        );
      const unit = createUnit({
        tenantId: actor.tenantId,
        projectId,
        fields,
        tenantCurrency: tenant.currency,
        placement,
        createdBy: actor.userId,
      });
      if (!(await repos.projects.findById(actor.tenantId, projectId)))
        throw new NotFoundError('Project not found');
      await assertPlacement(repos, actor.tenantId, projectId, unit);
      if (await repos.units.unitNoTaken(actor.tenantId, projectId, unit.unitNo)) {
        throw new ConflictError('UNIT_NO_TAKEN', 'Unit number already exists in this project');
      }
      await repos.units.insert(unit);
      await repos.unitHistory.add({
        tenantId: actor.tenantId,
        unitId: unit.id,
        status: 'available',
        changedBy: actor.userId,
        changedByName: actor.name,
      });
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'unit.create',
        subjectType: 'unit',
        subjectId: unit.id,
        after: { unitNo: unit.unitNo, status: unit.status },
      });
      await announceUnit({ repos, unit, clock: this.clock });
      return unit;
    });
  }
}

/** Block, phase and floor must belong to the same project (and the floor to the block). */
export async function assertPlacement(repos, tenantId, projectId, unit) {
  if (unit.blockId) {
    const block = await repos.structure.findBlock(tenantId, unit.blockId);
    if (!block || block.projectId !== projectId)
      throw new NotFoundError('Block not found in this project');
  }
  if (unit.phaseId) {
    const phase = await repos.structure.findPhase(tenantId, unit.phaseId);
    if (!phase || phase.projectId !== projectId)
      throw new NotFoundError('Phase not found in this project');
  }
  if (unit.floorId) {
    const floor = await repos.structure.findFloor(tenantId, unit.floorId);
    if (!floor || floor.blockId !== unit.blockId)
      throw new NotFoundError('Floor not found in this block');
  }
}
