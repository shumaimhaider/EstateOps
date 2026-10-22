import { consumeOnce } from '@estateops/kernel';

/** Event customer.upserted: keep the customer snapshot and the names on their bookings. */
export class ApplyCustomer {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute(event) {
    const d = event.data;
    return this.uow.run((repos) =>
      consumeOnce(repos, event, async () => {
        const written = await repos.customerRefs.upsert(
          {
            customerId: d.customer_id,
            tenantId: event.tenant_id,
            fullName: d.full_name,
            phone: d.phone,
            email: d.email,
          },
          event.occurred_at,
        );
        if (written)
          await repos.bookingRefs.refreshCustomer(event.tenant_id, d.customer_id, {
            name: d.full_name,
            phone: d.phone,
            email: d.email,
          });
      }),
    );
  }
}
