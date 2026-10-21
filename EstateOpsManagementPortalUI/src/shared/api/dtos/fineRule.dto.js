import { z } from 'zod';

/**
 * A late-fine rate, optionally for one unit category (`unit_kind`, null = every category).
 * `kind` percent: `value` is basis points (200 = 2%) of the installment
 * amount. `kind` fixed: `value` is minor units per overdue installment.
 * @typedef {z.infer<typeof fineRuleDtoSchema>} FineRuleDto
 */
export const fineRuleDtoSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  scope: z.enum(['default', 'project', 'unit', 'customer']),
  scope_id: z.uuid().nullable(),
  scope_name: z.string().nullable(),
  unit_kind: z.enum(['plot', 'flat', 'villa', 'shop']).nullable(),
  kind: z.enum(['percent', 'fixed']),
  value: z.number().int(),
  currency: z.string().length(3),
  allowed_actions: z.array(z.string()),
  updated_at: z.iso.datetime().nullable(),
  updated_by_name: z.string().nullable(),
});

/** GET /fine-rules/effective: the rate that applies at a scope, after inheritance. */
export const effectiveFineRuleDtoSchema = z.object({
  rule: fineRuleDtoSchema,
  inherited: z.boolean(),
  scope: z.enum(['default', 'project', 'unit', 'customer']),
  scope_id: z.uuid().nullable(),
  unit_kind: z.enum(['plot', 'flat', 'villa', 'shop']).nullable(),
  allowed_actions: z.array(z.string()),
});

/** Request body for PUT /fine-rules (create or replace the rate at one scope). */
export const fineRuleWriteDtoSchema = z.object({
  scope: z.enum(['default', 'project', 'unit', 'customer']),
  scope_id: z.uuid().nullable(),
  unit_kind: z.enum(['plot', 'flat', 'villa', 'shop']).nullable(),
  kind: z.enum(['percent', 'fixed']),
  value: z.number().int().nonnegative(),
});
