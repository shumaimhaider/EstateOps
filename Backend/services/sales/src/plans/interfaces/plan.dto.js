import { z } from 'zod';

export const createPlanRequest = z.object({
  name: z.string(),
  down_pct: z.number(),
  installment_count: z.number(),
});
export const updatePlanRequest = z
  .object({
    name: z.string().optional(),
    down_pct: z.number().optional(),
    installment_count: z.number().optional(),
  })
  .strict();

export const toPlanFields = (body) => ({
  name: body.name,
  downPct: body.down_pct,
  installmentCount: body.installment_count,
});

export const toPlanResponse = ({ plan, allowedActions }) => ({
  id: plan.id,
  tenant_id: plan.tenantId,
  name: plan.name,
  down_pct: plan.downPct,
  installment_count: plan.installmentCount,
  allowed_actions: allowedActions,
});
