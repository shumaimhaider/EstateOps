import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { contractActions } from '../domain/contract.js';

export const withActions = (contract, actor) => ({
  contract,
  allowedActions: contractActions(contract, actor.permissions),
});

/** A booking's contracts, newest version first. Needs contracts.view. */
export class ListContracts {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, bookingId }) {
    assertCan(actor, PERMISSION.CONTRACTS_VIEW);
    return this.uow.read(async (repos) => {
      if (!(await repos.bookingRefs.findById(actor.tenantId, bookingId)))
        throw new NotFoundError('Booking not found');
      const items = (await repos.contracts.listForBooking(actor.tenantId, bookingId)).map((c) =>
        withActions(c, actor),
      );
      return { items, nextCursor: null };
    });
  }
}
