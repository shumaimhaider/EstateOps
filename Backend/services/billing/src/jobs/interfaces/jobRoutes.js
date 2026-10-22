import express from 'express';

/** POST /internal/jobs/sweep: runs the status sweep now (also run on a timer by the server). */
export function createJobRoutes({ sweepStatuses }) {
  const router = express.Router();
  router.post('/jobs/sweep', async (_req, res) => res.json(await sweepStatuses.execute()));
  return router;
}
