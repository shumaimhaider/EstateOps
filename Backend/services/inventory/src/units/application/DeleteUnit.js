import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';

/** A unit that was ever booked is part of the sales history and cannot be deleted. */
export class DeleteUnit {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.INVENTORY_MANAGE);
    return this.uow.run(async (repos) => {
      const unit = await repos.units.findById(actor.tenantId, id, { lock: true });
      if (!unit) throw new NotFoundError('Unit not found');
      if (unit.everBooked || unit.status === 'booked' || unit.status === 'sold') {
        throw new ConflictError(
          'UNIT_HAS_HISTORY',
          'A unit that has been booked cannot be deleted',
        );
      }
      await repos.units.delete(actor.tenantId, id);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'unit.delete',
        subjectType: 'unit',
        subjectId: id,
        before: { unitNo: unit.unitNo, status: unit.status },
      });
    });
  }
}
