import express from 'express';
import { z } from 'zod';
import { decodeCursor, encodeCursor, toIso } from '@estateops/kernel';
import { actorFrom, customerFrom, pageResponse } from '@estateops/platform';
import { maskIdNumber } from '../../customers/domain/customer.js';

const createRequest = z.object({
  subject: z.string(),
  message: z.string(),
  booking_id: z.string().nullable().optional(),
});
const messageRequest = z.object({ message: z.string() });
const listQuery = z.object({
  status: z.enum(['open', 'answered', 'closed']).optional(),
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

const toMessage = (m) => ({
  id: m.id,
  author_kind: m.authorKind,
  author_name: m.authorName,
  body: m.body,
  created_at: toIso(m.createdAt),
});
const toRequest = (r) => ({
  id: r.id,
  subject: r.subject,
  status: r.status,
  booking_id: r.bookingId,
  created_at: toIso(r.createdAt),
  last_message_at: toIso(r.lastMessageAt),
  ...(r.messageCount === undefined ? {} : { message_count: r.messageCount }),
});
const toStaffRequest = (r) => ({
  ...toRequest(r),
  customer_id: r.customerId,
  customer_name: r.customerName,
});
const toThread =
  (map) =>
  ({ request, messages }) => ({ ...map(request), messages: messages.map(toMessage) });

const pageOf = (page, map) =>
  pageResponse(
    {
      items: page.items,
      nextCursor: page.next ? encodeCursor({ v: toIso(page.next.at), id: page.next.id }) : null,
    },
    map,
  );
const cursorOf = (c) => (c ? { at: decodeCursor(c).v, id: decodeCursor(c).id } : undefined);

/** The customer portal: my profile and my support requests. */
export function createPortalSupportRoutes(uc) {
  const router = express.Router();
  router.get('/profile', async (req, res) => {
    const { customer: c, currency } = await uc.getMyProfile.execute({
      customer: customerFrom(req),
    });
    res.json({
      id: c.id,
      name: c.fullName,
      email: c.email ?? '',
      phone: c.phone ?? '',
      city: c.city ?? '',
      preferred_language: c.preferredLanguage,
      id_number_masked: maskIdNumber(c.idNumber),
      currency,
    });
  });
  router.get('/support-requests', async (req, res) => {
    const q = listQuery.parse(req.query);
    res.json(
      pageOf(
        await uc.listMySupportRequests.execute({
          customer: customerFrom(req),
          status: q.status,
          cursor: cursorOf(q.cursor),
          limit: Math.min(q.limit ?? 25, 100),
        }),
        toRequest,
      ),
    );
  });
  router.post('/support-requests', async (req, res) => {
    const body = createRequest.parse(req.body);
    res.status(201).json(
      toThread(toRequest)(
        await uc.createSupportRequest.execute({
          customer: customerFrom(req),
          subject: body.subject,
          message: body.message,
          bookingId: body.booking_id ?? null,
        }),
      ),
    );
  });
  router.get('/support-requests/:id', async (req, res) => {
    res.json(
      toThread(toRequest)(
        await uc.getMySupportRequest.execute({ customer: customerFrom(req), id: req.params.id }),
      ),
    );
  });
  router.post('/support-requests/:id/messages', async (req, res) => {
    const { message } = messageRequest.parse(req.body);
    res.status(201).json(
      toThread(toRequest)(
        await uc.addMySupportMessage.execute({
          customer: customerFrom(req),
          id: req.params.id,
          message,
        }),
      ),
    );
  });
  return router;
}

/** Staff: the support queue, replies, close and reopen. */
export function createStaffSupportRoutes(uc) {
  const router = express.Router();
  router.get('/support-requests', async (req, res) => {
    const q = listQuery.parse(req.query);
    const page = await uc.listSupportRequests.execute({
      actor: actorFrom(req),
      status: q.status,
      q: q.q,
      cursor: cursorOf(q.cursor),
      limit: Math.min(q.limit ?? 25, 100),
    });
    res.json({ ...pageOf(page, toStaffRequest), waiting: page.waiting });
  });
  router.get('/support-requests/:id', async (req, res) => {
    res.json(
      toThread(toStaffRequest)(
        await uc.getSupportRequest.execute({ actor: actorFrom(req), id: req.params.id }),
      ),
    );
  });
  router.post('/support-requests/:id/messages', async (req, res) => {
    const { message } = messageRequest.parse(req.body);
    res.status(201).json(
      toThread(toStaffRequest)(
        await uc.replyToSupportRequest.execute({
          actor: actorFrom(req),
          id: req.params.id,
          message,
        }),
      ),
    );
  });
  for (const action of ['close', 'reopen']) {
    router.post(`/support-requests/:id/${action}`, async (req, res) => {
      res.json(
        toThread(toStaffRequest)(
          await uc.setSupportStatus.execute({ actor: actorFrom(req), id: req.params.id, action }),
        ),
      );
    });
  }
  return router;
}
