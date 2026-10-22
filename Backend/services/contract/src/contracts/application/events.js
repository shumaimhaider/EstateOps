import { EVENT, buildEvent } from '@estateops/contracts';

export const contractStatusChanged = (contract, now) =>
  buildEvent({
    type: EVENT.CONTRACT_STATUS_CHANGED,
    tenantId: contract.tenantId,
    producer: 'contract',
    now,
    data: { contract_id: contract.id, booking_id: contract.bookingId, status: contract.status },
  });
