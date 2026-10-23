import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { assertCanStart, createPandaDocContract, nextVersion } from '../domain/contract.js';
import { contractStatusChanged } from './events.js';
import { withActions } from './ListContracts.js';

/**
 * Starts a contract in PandaDoc from a template, with the buyer as signer. Refused when a contract
 * is already signed or still open. input: { actor, bookingId, template }
 */
export class CreatePandaDocContract {
  constructor({ uow, clock, esign }) {
    Object.assign(this, { uow, clock, esign });
  }

  async execute({ actor, bookingId, template }) {
    assertCan(actor, PERMISSION.CONTRACTS_MANAGE);
    return this.uow.run(async (repos) => {
      const booking = await repos.bookingRefs.findById(actor.tenantId, bookingId);
      if (!booking || booking.cancelled) throw new NotFoundError('Booking not found');
      const contracts = await repos.contracts.listForBooking(actor.tenantId, bookingId, {
        lock: true,
      });
      assertCanStart(contracts);
      const { documentId } = await this.esign.createDocument({
        template,
        signerEmail: booking.customerEmail,
        signerName: booking.customerName,
        bookingId,
        unitNo: booking.unitNo,
      });
      const contract = createPandaDocContract({
        tenantId: actor.tenantId,
        bookingId,
        template,
        signerEmail: booking.customerEmail,
        version: nextVersion(contracts),
        documentId,
        createdByName: actor.name,
      });
      const stored = await repos.contracts.insert(contract);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'contract.create',
        subjectType: 'contract',
        subjectId: contract.id,
        after: { bookingId, template, version: contract.version },
      });
      await repos.outbox.add(contractStatusChanged(contract, this.clock.now()));
      return withActions(stored, actor);
    });
  }
}
