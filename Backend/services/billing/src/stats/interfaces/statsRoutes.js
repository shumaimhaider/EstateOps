import express from 'express';
import { z } from 'zod';
import { actorFrom } from '@estateops/platform';

export const toStatsResponse = (s) => ({
  currency: s.currency,
  as_of: s.asOf,
  summary: {
    total_sale_value: s.summary.totalSaleValue,
    received_amount: s.summary.receivedAmount,
    pending_amount: s.summary.pendingAmount,
    overdue_amount: s.summary.overdueAmount,
    due_this_month_amount: s.summary.dueThisMonthAmount,
    fine_amount: s.summary.fineAmount,
    installments_total: s.summary.installmentsTotal,
    installments_paid: s.summary.installmentsPaid,
    installments_due: s.summary.installmentsDue,
    installments_overdue: s.summary.installmentsOverdue,
    installments_upcoming: s.summary.installmentsUpcoming,
    bookings_count: s.summary.bookingsCount,
    escalated_count: s.summary.escalatedCount,
    units_total: s.summary.unitsTotal,
    units_available: s.summary.unitsAvailable,
    units_booked: s.summary.unitsBooked,
    units_sold: s.summary.unitsSold,
  },
  by_month: s.byMonth.map((m) => ({
    month: m.month,
    due_amount: m.dueAmount,
    collected_amount: m.collectedAmount,
  })),
  ageing: s.ageing,
  units_by_kind: s.unitsByKind,
  by_project: s.byProject.map((p) => ({
    project_id: p.projectId,
    project_name: p.projectName,
    units_total: p.unitsTotal,
    units_sold: p.unitsSold,
    sale_value: p.saleValue,
    received_amount: p.receivedAmount,
    pending_amount: p.pendingAmount,
    overdue_amount: p.overdueAmount,
  })),
});

export function createStatsRoutes(uc) {
  const router = express.Router();
  router.get('/stats/collections', async (req, res) => {
    const { project_id: projectId } = z
      .object({ project_id: z.string().optional() })
      .parse(req.query);
    res.json(
      toStatsResponse(
        await uc.getCollectionStats.execute({
          actor: actorFrom(req),
          projectId: projectId ?? null,
        }),
      ),
    );
  });
  return router;
}
