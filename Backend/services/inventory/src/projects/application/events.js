import { EVENT, buildEvent } from '@estateops/contracts';

export const PRODUCER = 'inventory';

export const projectUpserted = (project, now) =>
  buildEvent({
    type: EVENT.PROJECT_UPSERTED,
    tenantId: project.tenantId,
    producer: PRODUCER,
    now,
    data: { project_id: project.id, name: project.name, kind: project.kind },
  });

export const unitUpserted = (unit, projectName, now) =>
  buildEvent({
    type: EVENT.UNIT_UPSERTED,
    tenantId: unit.tenantId,
    producer: PRODUCER,
    now,
    data: {
      unit_id: unit.id,
      project_id: unit.projectId,
      project_name: projectName,
      unit_no: unit.unitNo,
      kind: unit.kind,
      status: unit.status,
      list_price: unit.listPrice,
      currency: unit.currency,
    },
  });

export const unitBooked = (bookingId, unitId, tenantId, now) =>
  buildEvent({
    type: EVENT.UNIT_BOOKED,
    tenantId,
    producer: PRODUCER,
    now,
    data: { booking_id: bookingId, unit_id: unitId },
  });

export const unitBookingRejected = (bookingId, unitId, tenantId, reason, now) =>
  buildEvent({
    type: EVENT.UNIT_BOOKING_REJECTED,
    tenantId,
    producer: PRODUCER,
    now,
    data: { booking_id: bookingId, unit_id: unitId, reason },
  });
