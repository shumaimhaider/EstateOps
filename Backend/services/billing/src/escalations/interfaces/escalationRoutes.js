import express from 'express';
import { z } from 'zod';
import { toIso } from '@estateops/kernel';
import { actorFrom, pageResponse } from '@estateops/platform';

const listQuery = z.object({ cursor: z.string().optional(), limit: z.string().optional() });

export const toEscalationResponse = (e, tenantId) => ({
  id: e.bookingId,
  tenant_id: tenantId,
  booking_id: e.bookingId,
  unit_id: e.unitId,
  unit_no: e.unitNo,
  unit_kind: e.unitKind,
  project_name: e.projectName,
  customer_id: e.customerId,
  buyer_name: e.buyerName,
  buyer_phone: e.buyerPhone ?? '',
  currency: e.currency,
  missed_installments: e.missedInstallments,
  overdue_amount: e.overdueAmount,
  fine_amount: e.fineAmount,
  oldest_due_date: e.oldestDueDate,
  days_late: e.daysLate,
  notice_sent_at: toIso(e.noticeSentAt),
  status: e.status,
  allowed_actions: e.allowedActions,
  created_at: toIso(e.createdAt),
  updated_at: toIso(e.noticeSentAt ?? e.createdAt),
  created_by: null,
});

export function createEscalationRoutes(uc) {
  const router = express.Router();
  router.get('/escalations', async (req, res) => {
    const page = await uc.listEscalations.execute({
      actor: actorFrom(req),
      ...listQuery.parse(req.query),
    });
    res.json(pageResponse(page, (e) => toEscalationResponse(e, req.auth.tenantId)));
  });
  router.post('/escalations/:id/notice', async (req, res) => {
    res.json(
      toEscalationResponse(
        await uc.sendNotice.execute({ actor: actorFrom(req), bookingId: req.params.id }),
        req.auth.tenantId,
      ),
    );
  });
  return router;
}
