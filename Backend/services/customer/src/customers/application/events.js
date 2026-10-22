import { EVENT, buildEvent } from '@estateops/contracts';

export const customerUpserted = (customer, now) =>
  buildEvent({
    type: EVENT.CUSTOMER_UPSERTED,
    tenantId: customer.tenantId,
    producer: 'customer',
    now,
    data: {
      customer_id: customer.id,
      full_name: customer.fullName,
      phone: customer.phone,
      email: customer.email,
    },
  });
