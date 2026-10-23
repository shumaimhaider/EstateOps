import {
  ConflictError,
  InvalidTransitionError,
  NotFoundError,
  PERMISSION,
  assertCan,
} from '@estateops/kernel';

/**
 * A short-lived embedded signing session so the buyer can sign right on screen (in the office, or
 * in the customer portal) instead of from the email link. Only a PandaDoc contract that has been
 * sent and not yet signed or declined. The session is for the buyer's own address, so nobody else
 * can sign in their place. A customer's actor carries `customerId` and may only sign their own
 * contract; anything else is "not found", checked before the contract's state is revealed.
 * input: { actor, id }
 */
export class CreateSigningSession {
  constructor({ uow, esign, lifetimeSec = 900 }) {
    Object.assign(this, { uow, esign, lifetimeSec });
  }

  async execute({ actor, id }) {
    if (!actor.customerId) assertCan(actor, PERMISSION.CONTRACTS_MANAGE);
    const { contract, booking } = await this.uow.read(async (repos) => {
      const found = await repos.contracts.findById(actor.tenantId, id);
      return {
        contract: found,
        booking: found && (await repos.bookingRefs.findById(actor.tenantId, found.bookingId)),
      };
    });
    if (!contract || (actor.customerId && booking?.customerId !== actor.customerId)) {
      throw new NotFoundError('Contract not found');
    }
    if (contract.kind !== 'pandadoc') {
      throw new InvalidTransitionError('Only a PandaDoc contract can be signed on screen');
    }
    if (!['sent', 'viewed'].includes(contract.status)) {
      throw new InvalidTransitionError(
        contract.status === 'draft'
          ? 'Send the contract before it can be signed'
          : `A ${contract.status} contract cannot be signed`,
      );
    }
    if (!contract.signerEmail) {
      throw new ConflictError('NO_SIGNER', 'The buyer has no email address on file');
    }
    const session = await this.esign.createSigningSession(
      contract.providerDocumentId,
      contract.signerEmail,
      { lifetimeSec: this.lifetimeSec },
    );
    return {
      contractId: contract.id,
      url: session.url,
      expiresAt: session.expiresAt,
      sessionId: session.sessionId,
    };
  }
}
