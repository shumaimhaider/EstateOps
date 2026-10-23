import { ConflictError, NotFoundError, PERMISSION, assertCan, newId } from '@estateops/kernel';
import { createSignedUpload, hasSigned, nextVersion, openOnes } from '../domain/contract.js';
import { changeStatus } from './changeStatus.js';
import { contractStatusChanged } from './events.js';
import { withActions } from './ListContracts.js';

/**
 * Staff upload the paper-signed contract. It replaces any PandaDoc contract still open, and is
 * refused when the booking already has a signed contract (void that one first if it was wrong).
 * input: { actor, bookingId, file: { name, contentType, size, buffer }, title? }
 */
export class UploadSignedContract {
  constructor({ uow, clock, files, esign }) {
    Object.assign(this, { uow, clock, files, esign });
  }

  async execute({ actor, bookingId, file, title }) {
    assertCan(actor, PERMISSION.CONTRACTS_MANAGE);
    const fileKey = `${actor.tenantId}/${bookingId}/${newId()}.pdf`;
    let stored = false;
    try {
      return await this.uow.run(async (repos) => {
        const booking = await repos.bookingRefs.findById(actor.tenantId, bookingId);
        if (!booking || booking.cancelled) throw new NotFoundError('Booking not found');
        const contracts = await repos.contracts.listForBooking(actor.tenantId, bookingId, {
          lock: true,
        });
        if (hasSigned(contracts))
          throw new ConflictError(
            'CONTRACT_ALREADY_SIGNED',
            'This booking already has a signed contract',
          );
        const contract = createSignedUpload({
          tenantId: actor.tenantId,
          bookingId,
          file,
          title,
          version: nextVersion(contracts),
          fileKey,
          createdByName: actor.name,
          now: this.clock.now(),
        });

        for (const open of openOnes(contracts)) {
          await changeStatus({ repos, clock: this.clock, actor, contract: open, action: 'void' });
          await this.esign.voidDocument(open.providerDocumentId);
        }
        await this.files.put(fileKey, file.buffer);
        stored = true;
        const saved = await repos.contracts.insert(contract);
        await repos.audit.record({
          tenantId: actor.tenantId,
          actor,
          action: 'contract.upload',
          subjectType: 'contract',
          subjectId: contract.id,
          after: {
            bookingId,
            version: contract.version,
            fileName: contract.fileName,
            fileSize: contract.fileSize,
          },
        });
        await repos.outbox.add(contractStatusChanged(contract, this.clock.now()));
        return withActions(saved, actor);
      });
    } catch (error) {
      // the transaction rolled back, so do not leave an orphaned file behind
      if (stored) await this.files.remove(fileKey).catch(() => {});
      throw error;
    }
  }
}
