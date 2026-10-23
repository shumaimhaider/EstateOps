import { contractMachine } from '../domain/contract.js';
import { STATUS_ACTION } from './esignPort.js';
import { changeStatus } from './changeStatus.js';

const PROVIDER = { userId: null, name: 'PandaDoc' };

/**
 * The signer's actions, reported by PandaDoc's webhook: opened, signed, declined (and voided
 * elsewhere). Each event is applied only if the contract's state allows it, so a repeated, late
 * or out-of-order event changes nothing; a signed PandaDoc contract is final. A document this
 * system does not know is ignored. Returns what happened per event.
 * input: [{ documentId, status }]
 */
export class ApplyProviderEvents {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute(events) {
    const outcomes = [];
    for (const { documentId, status } of events) {
      const action = STATUS_ACTION[status];
      if (!action) {
        outcomes.push({ documentId, status, outcome: 'ignored' });
        continue;
      }
      outcomes.push(
        await this.uow.run(async (repos) => {
          const contract = await repos.contracts.findByProviderDocumentId(documentId, {
            lock: true,
          });
          if (!contract) return { documentId, status, outcome: 'unknown_document' };
          if (!contractMachine.can(contract.status, action)) {
            return { documentId, status, outcome: 'not_applicable', current: contract.status };
          }
          await changeStatus({
            repos,
            clock: this.clock,
            actor: PROVIDER,
            contract,
            action,
            auditAction: `contract.${action === 'sign' ? 'signed' : action === 'view' ? 'viewed' : action === 'decline' ? 'declined' : 'void'}`,
          });
          return { documentId, status, outcome: 'applied', action };
        }),
      );
    }
    return outcomes;
  }
}
