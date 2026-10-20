import { z } from 'zod';

/**
 * Wire shape of a unit (GET /admin/units). THE ONLY PLACE the backend field names for
 * this entity are declared (besides its mapper, GraphQL fragment and the mock server).
 * Money is an integer in minor units + currency.
 *
 * @typedef {z.infer<typeof unitDtoSchema>} UnitDto
 */
export const unitDtoSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  project_id: z.uuid(),
  project_name: z.string(),
  phase_id: z.uuid().nullable(),
  block_id: z.uuid().nullable(),
  block_name: z.string().nullable(),
  floor_id: z.uuid().nullable(),
  floor_label: z.string().nullable(),
  unit_no: z.string(),
  kind: z.enum(['plot', 'flat', 'villa', 'shop']),
  area_value: z.number().positive(),
  area_unit: z.enum(['marla', 'kanal', 'sq_ft', 'sq_yd', 'sq_m']),
  bedrooms: z.number().int().nullable(),
  facing: z.string().nullable(),
  view: z.string().nullable(),
  corner: z.boolean(),
  parking: z.number().int(),
  attributes: z.record(z.string(), z.unknown()),
  status: z.enum(['available', 'held', 'booked', 'sold', 'blocked']),
  list_price: z.number().int().nonnegative(),
  currency: z.string().length(3),
  geometry: z.record(z.string(), z.unknown()).nullable(),
  allowed_actions: z.array(z.string()),
  booking_id: z.uuid().nullable(),
  media: z
    .array(z.object({ id: z.string(), kind: z.string(), url: z.string(), caption: z.string() }))
    .optional(),
  status_history: z
    .array(
      z.object({
        status: z.enum(['available', 'held', 'booked', 'sold', 'blocked']),
        changed_by: z.uuid().nullable(),
        changed_by_name: z.string().nullable(),
        changed_at: z.iso.datetime(),
      }),
    )
    .optional(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  created_by: z.uuid().nullable(),
});

/** Request body for POST /admin/units. */
export const unitWriteDtoSchema = z.object({
  project_id: z.uuid(),
  unit_no: z.string().min(1),
  kind: unitDtoSchema.shape.kind,
  area_value: z.number().positive(),
  area_unit: unitDtoSchema.shape.area_unit,
  bedrooms: z.number().int().nullable(),
  facing: z.string().nullable(),
  view: z.string().nullable(),
  corner: z.boolean(),
  parking: z.number().int(),
  list_price: z.number().int().nonnegative(),
  currency: z.string().length(3),
});
