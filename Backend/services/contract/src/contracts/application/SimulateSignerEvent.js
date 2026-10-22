import {
  InvalidTransitionError,
  NotFoundError,
  PERMISSION,
  assertCan,
  fieldError,
} from '@estateops/kernel';
import { SIGNER_EVENTS } from '../domain/contract.js';
import { changeStatus } from './changeStatus.js';
import { withActions } from './ListContracts.js';

/**
 * Development only: stands in for PandaDoc's webhook (the signer opened, signed or declined the
 * document). Never mounted in production. input: { actor, id, event: 'viewed'|'signed'|'declined' }
 */
export class SimulateSignerEvent {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, id, event }) {
    assertCan(actor, PERMISSION.CONTRACTS_MANAGE);
    const action = SIGNER_EVENTS[event];
    if (!action)
      throw fieldError('event', 'Unknown signer event', 'The event could not be applied');
    return this.uow.run(async (repos) => {
      const contract = await repos.contracts.findById(actor.tenantId, id, { lock: true });
      if (!contract) throw new NotFoundError('Contract not found');
      if (contract.kind !== 'pandadoc')
        throw new InvalidTransitionError('Only a PandaDoc contract has a signer');
      return withActions(
        await changeStatus({
          repos,
          clock: this.clock,
          actor,
          contract,
          action,
          auditAction: `contract.${event}`,
        }),
        actor,
      );
    });
  }
}
