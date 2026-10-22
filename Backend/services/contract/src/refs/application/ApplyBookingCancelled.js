import { consumeOnce } from '@estateops/kernel';
import { contractMachine, openOnes } from '../../contracts/domain/contract.js';
import { changeStatus } from '../../contracts/application/changeStatus.js';

const SYSTEM = { userId: null, name: 'Sales' };

/**
 * Event booking.cancelled: mark the booking cancelled (remembering it even if it was never seen
 * here, so a late booking.confirmed cannot revive it) and void every contract still open.
 */
export class ApplyBookingCancelled {
  constructor({ uow, clock, esign }) {
    Object.assign(this, { uow, clock, esign });
  }

  async execute(event) {
    const { booking_id: bookingId, customer_id: customerId } = event.data;
    return this.uow.run((repos) =>
      consumeOnce(repos, event, async () => {
        await repos.bookingRefs.markCancelled({ bookingId, tenantId: event.tenant_id, customerId });
        const contracts = await repos.contracts.listForBooking(event.tenant_id, bookingId, {
          lock: true,
        });
        for (const open of openOnes(contracts)) {
          if (!contractMachine.can(open.status, 'void')) continue;
          await changeStatus({
            repos,
            clock: this.clock,
            actor: SYSTEM,
            contract: open,
            action: 'void',
          });
          await this.esign.voidDocument(open.providerDocumentId);
        }
      }),
    );
  }
}
