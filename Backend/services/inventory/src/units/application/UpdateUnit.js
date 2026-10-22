import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { updateUnit } from '../domain/unit.js';
import { announceUnit } from './announce.js';

/** Edits a unit that is not booked or sold. input: { actor, id, fields } */
export class UpdateUnit {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, id, fields }) {
    assertCan(actor, PERMISSION.INVENTORY_MANAGE);
    return this.uow.run(async (repos) => {
      const current = await repos.units.findById(actor.tenantId, id, { lock: true });
      if (!current) throw new NotFoundError('Unit not found');
      const tenant = await repos.tenantRefs.get(actor.tenantId);
      const next = updateUnit(current, fields, tenant?.currency ?? current.currency);
      if (
        next.unitNo.toLowerCase() !== current.unitNo.toLowerCase() &&
        (await repos.units.unitNoTaken(actor.tenantId, current.projectId, next.unitNo))
      ) {
        throw new ConflictError('UNIT_NO_TAKEN', 'Unit number already exists in this project');
      }
      const saved = await repos.units.update(next);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'unit.update',
        subjectType: 'unit',
        subjectId: id,
        before: {
          unitNo: current.unitNo,
          listPrice: current.listPrice,
          areaValue: current.areaValue,
          kind: current.kind,
        },
        after: {
          unitNo: saved.unitNo,
          listPrice: saved.listPrice,
          areaValue: saved.areaValue,
          kind: saved.kind,
        },
      });
      await announceUnit({ repos, unit: saved, clock: this.clock });
      return saved;
    });
  }
}
