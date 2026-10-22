import {
  InvalidTransitionError,
  NotFoundError,
  PERMISSION,
  assertCan,
  fieldError,
} from '@estateops/kernel';
import { contractActions, nextVersion, reviseContract } from '../domain/contract.js';
import { changeStatus } from './changeStatus.js';
import { contractStatusChanged } from './events.js';
import { withActions } from './ListContracts.js';

/**
 * send | void | revise on one contract (needs contracts.manage). The contract row is locked first,
 * so two people cannot act on it at once. Revise returns the NEW draft; the old version is voided.
 * input: { actor, id, action, note? }
 */
export class ActOnContract {
  constructor({ uow, clock, esign }) {
    Object.assign(this, { uow, clock, esign });
  }

  async execute({ actor, id, action, note }) {
    assertCan(actor, PERMISSION.CONTRACTS_MANAGE);
    return this.uow.run(async (repos) => {
      const contract = await repos.contracts.findById(actor.tenantId, id, { lock: true });
      if (!contract) throw new NotFoundError('Contract not found');
      if (!contractActions(contract, actor.permissions).includes(action)) {
        throw new InvalidTransitionError(`Cannot ${action} a contract that is ${contract.status}`);
      }
      if (action === 'send') return this.#send(repos, actor, contract);
      if (action === 'void') return this.#void(repos, actor, contract);
      return this.#revise(repos, actor, contract, note);
    });
  }

  async #send(repos, actor, contract) {
    if (!contract.signerEmail)
      throw fieldError(
        'signer_email',
        'The buyer has no email address to send the contract to',
        'The contract could not be sent',
      );
    await this.esign.sendDocument(contract.providerDocumentId, contract.signerEmail);
    return withActions(
      await changeStatus({ repos, clock: this.clock, actor, contract, action: 'send' }),
      actor,
    );
  }

  async #void(repos, actor, contract) {
    const saved = await changeStatus({ repos, clock: this.clock, actor, contract, action: 'void' });
    if (contract.providerDocumentId) await this.esign.voidDocument(contract.providerDocumentId);
    return withActions(saved, actor);
  }

  async #revise(repos, actor, contract, note) {
    const all = await repos.contracts.listForBooking(actor.tenantId, contract.bookingId, {
      lock: true,
    });
    const { documentId } = await this.esign.createDocument({
      template: contract.template,
      signerEmail: contract.signerEmail,
      bookingId: contract.bookingId,
    });
    const next = reviseContract(contract, {
      note,
      version: nextVersion(all),
      documentId,
      createdByName: actor.name,
    });
    await changeStatus({ repos, clock: this.clock, actor, contract, action: 'revise' });
    await this.esign.voidDocument(contract.providerDocumentId);
    await repos.contracts.insert(next);
    await repos.audit.record({
      tenantId: actor.tenantId,
      actor,
      action: 'contract.create',
      subjectType: 'contract',
      subjectId: next.id,
      after: { bookingId: next.bookingId, version: next.version, supersedes: contract.id },
    });
    await repos.outbox.add(contractStatusChanged(next, this.clock.now()));
    return withActions(next, actor);
  }
}
