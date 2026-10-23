import { consumeOnce, today as todayOf } from '@estateops/kernel';
import { buildSchedule, toInvoices } from '../domain/schedule.js';
import { scheduleCreated, scheduleFailed } from './events.js';
import { refreshBooking } from './refreshBooking.js';

const SYSTEM = { userId: null, name: 'Sales' };

/**
 * Event booking.confirmed: remember the booking, build its whole payment schedule with consecutive
 * invoice numbers, price fines on anything already overdue (a back-dated sale), and announce
 * schedule.created plus the first money summary. A booking cancelled before this arrived, or one
 * already scheduled, is left alone.
 */
export class CreateSchedule {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute(event) {
    const d = event.data;
    return this.uow.run((repos) =>
      consumeOnce(repos, event, async () => {
        const tenantId = event.tenant_id;
        if (
          (await repos.bookingRefs.findById(tenantId, d.booking_id)) ||
          (await repos.bookingRefs.isCancelled(d.booking_id))
        )
          return;
        const tenant = await repos.tenantRefs.get(tenantId);
        // the tenant event normally comes first; if not, fail so the sender retries shortly
        if (!tenant) throw new Error(`Tenant ${tenantId} is not known to billing yet`);
        const settings = await repos.settings.get(tenantId);

        // The schedule is pure arithmetic: if it cannot be built it never will be, so retrying is
        // pointless. Tell sales to undo the booking (compensation) instead of failing forever.
        let rows;
        try {
          rows = buildSchedule({
            totalPrice: d.total_price,
            downPct: d.plan.down_pct,
            installmentCount: d.plan.installment_count,
            bookedAt: d.booked_at,
            today: todayOf(this.clock),
            graceDays: settings.graceDays,
          });
          if (rows.length === 0) throw new Error('The plan produces no invoices');
        } catch (error) {
          await repos.audit.record({
            tenantId,
            actor: SYSTEM,
            action: 'schedule.failed',
            subjectType: 'booking',
            subjectId: d.booking_id,
            after: { reason: error.message },
          });
          await repos.outbox.add(
            scheduleFailed(tenantId, d.booking_id, error.message, this.clock.now()),
          );
          return;
        }

        const ref = {
          bookingId: d.booking_id,
          tenantId,
          customerId: d.customer.id,
          customerName: d.customer.full_name,
          customerPhone: d.customer.phone,
          customerEmail: d.customer.email,
          unitId: d.unit.id,
          unitNo: d.unit.unit_no,
          unitKind: d.unit.kind,
          projectId: d.unit.project_id,
          projectName: d.unit.project_name,
          totalPrice: d.total_price,
          currency: d.currency,
          planName: d.plan.name,
          status: 'active',
          bookedAt: d.booked_at,
        };
        await repos.bookingRefs.insert(ref);

        const last = await repos.counters.next(tenantId, 'invoice', rows.length);
        const invoices = toInvoices({
          booking: ref,
          rows,
          firstNumber: last - rows.length + 1,
          slug: tenant.slug,
        });
        await repos.installments.insertMany(invoices);
        await repos.fines.repriceIds(
          tenantId,
          invoices.filter((i) => i.status === 'overdue').map((i) => i.id),
        );

        await repos.audit.record({
          tenantId,
          actor: SYSTEM,
          action: 'schedule.create',
          subjectType: 'booking',
          subjectId: d.booking_id,
          after: { invoices: invoices.length, total: d.total_price },
        });
        await repos.outbox.add(scheduleCreated(ref, invoices.length, this.clock.now()));
        await refreshBooking({ repos, tenantId, bookingId: d.booking_id, clock: this.clock });
      }),
    );
  }
}
