import express from 'express';
import { actorFrom, customerFrom, pageResponse } from '@estateops/platform';
import {
  cancelBookingRequest,
  createBookingRequest,
  listBookingsQuery,
  toBookingResponse,
  toPortalPropertyResponse,
} from './booking.dto.js';

export function createBookingRoutes(uc) {
  const router = express.Router();
  const one = async (req, id) =>
    toBookingResponse(await uc.getBooking.execute({ actor: actorFrom(req), id }));

  router.get('/bookings', async (req, res) => {
    const {
      project_id: projectId,
      unit_id: unitId,
      customer_id: customerId,
      escalated,
      ...rest
    } = listBookingsQuery.parse(req.query);
    const page = await uc.listBookings.execute({
      actor: actorFrom(req),
      projectId,
      unitId,
      customerId,
      escalated: escalated === 'true',
      ...rest,
    });
    res.json(pageResponse(page, toBookingResponse));
  });
  router.post('/bookings', async (req, res) => {
    const body = createBookingRequest.parse(req.body);
    const booking = await uc.createBooking.execute({
      actor: actorFrom(req),
      unitId: body.unit_id,
      customerId: body.customer_id,
      planId: body.plan_id,
      bookedAt: body.booked_at,
    });
    res.status(201).json(await one(req, booking.id));
  });
  router.get('/bookings/:id', async (req, res) => {
    res.json(await one(req, req.params.id));
  });
  router.post('/bookings/:id/cancel', async (req, res) => {
    const { reason } = cancelBookingRequest.parse(req.body ?? {});
    await uc.cancelBooking.execute({ actor: actorFrom(req), id: req.params.id, reason });
    res.json(await one(req, req.params.id));
  });
  return router;
}

/** The customer portal's properties: the signed-in customer's own bookings, read-only. */
export function createPortalPropertyRoutes(uc) {
  const router = express.Router();
  router.get('/properties', async (req, res) => {
    const { cursor, limit } = listBookingsQuery
      .pick({ cursor: true, limit: true })
      .parse(req.query);
    res.json(
      pageResponse(
        await uc.listMyBookings.execute({ customer: customerFrom(req), cursor, limit }),
        toPortalPropertyResponse,
      ),
    );
  });
  router.get('/properties/:id', async (req, res) => {
    res.json(
      toPortalPropertyResponse(
        await uc.getMyBooking.execute({ customer: customerFrom(req), id: req.params.id }),
      ),
    );
  });
  return router;
}
