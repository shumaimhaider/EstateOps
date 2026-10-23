import express from 'express';

/** POST /internal/jobs/sweep and /jobs/collect: run a job now (the server also runs them on a schedule). */
export function createJobRoutes({ sweepStatuses, collectDueInvoices, uow }) {
  const router = express.Router();
  router.post('/jobs/sweep', async (_req, res) => res.json(await sweepStatuses.execute()));
  // asks the payment worker to charge every due invoice that has a saved card (also run daily)
  router.post('/jobs/collect', async (_req, res) => res.json(await collectDueInvoices.execute()));
  // sales asks this before it cancels a booking: has any money been received on it?
  router.get('/bookings/:id/has-payments', async (req, res) => {
    const tenantId = String(req.query.tenant_id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(tenantId))
      return res
        .status(422)
        .json({ code: 'VALIDATION_ERROR', message: 'tenant_id is required', details: [] });
    const found = await uow.read((repos) =>
      repos.installments.hasPayments(tenantId, req.params.id),
    );
    return res.json({ has_payments: found });
  });
  return router;
}
