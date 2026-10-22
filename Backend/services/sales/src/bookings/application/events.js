import { EVENT, buildEvent } from '@estateops/contracts';

const base = (booking, now) => ({ tenantId: booking.tenantId, producer: 'sales', now });

export const bookingRequested = (b, now) =>
  buildEvent({
    ...base(b, now),
    type: EVENT.BOOKING_REQUESTED,
    data: { booking_id: b.id, unit_id: b.unitId, customer_id: b.customerId },
  });

export const bookingConfirmed = (b, now) =>
  buildEvent({
    ...base(b, now),
    type: EVENT.BOOKING_CONFIRMED,
    data: {
      booking_id: b.id,
      unit: {
        id: b.unitId,
        unit_no: b.unitNo,
        kind: b.unitKind,
        project_id: b.projectId,
        project_name: b.projectName,
      },
      customer: {
        id: b.customerId,
        full_name: b.buyerName,
        phone: b.buyerPhone,
        email: b.buyerEmail,
      },
      plan: { name: b.planName, down_pct: b.downPct, installment_count: b.installmentCount },
      total_price: b.totalPrice,
      currency: b.currency,
      booked_at: b.bookedAt,
    },
  });

export const bookingCompleted = (b, now) =>
  buildEvent({
    ...base(b, now),
    type: EVENT.BOOKING_COMPLETED,
    data: { booking_id: b.id, unit_id: b.unitId },
  });

export const bookingCancelled = (b, now) =>
  buildEvent({
    ...base(b, now),
    type: EVENT.BOOKING_CANCELLED,
    data: { booking_id: b.id, unit_id: b.unitId, customer_id: b.customerId },
  });
