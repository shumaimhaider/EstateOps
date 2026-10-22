import { consumeOnce } from '@estateops/kernel';

/**
 * Event booking.summary_changed: keep the booking's money figures and recompute the customer's
 * totals as sums over their bookings. `seq` makes a late, older summary a no-op.
 */
export class ApplyBookingSummary {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute(event) {
    const d = event.data;
    return this.uow.run((repos) =>
      consumeOnce(repos, event, async () => {
        if (!(await repos.customers.findById(event.tenant_id, d.customer_id))) return; // customer is gone: nothing to total
        const applied = await repos.bookingSummaries.upsert({
          bookingId: d.booking_id,
          tenantId: event.tenant_id,
          customerId: d.customer_id,
          unitNo: d.unit_no,
          totalPrice: d.total_price,
          currency: d.currency,
          receivedAmount: d.received_amount,
          pendingAmount: d.pending_amount,
          overdueAmount: d.overdue_amount,
          escalated: d.escalated,
          seq: d.seq,
        });
        if (applied) await repos.customers.recomputeTotals(event.tenant_id, d.customer_id);
      }),
    );
  }
}
