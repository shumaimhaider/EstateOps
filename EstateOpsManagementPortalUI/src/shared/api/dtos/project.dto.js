import { z } from 'zod';

const UNIT_STATUS = z.enum(['available', 'held', 'booked', 'sold', 'blocked']);

/**
 * Wire shape of a project, including live unit counts per status.
 * @typedef {z.infer<typeof projectDtoSchema>} ProjectDto
 */
export const projectDtoSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  name: z.string(),
  location: z.string(),
  kind: z.enum(['plot_society', 'tower', 'mixed']),
  units_total: z.number().int(),
  unit_counts: z.record(UNIT_STATUS, z.number().int()),
  allowed_actions: z.array(z.string()),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  created_by: z.uuid().nullable(),
});

/** Site plan: block outlines plus one shape per unit, coloured by live status. */
export const projectMapDtoSchema = z.object({
  project_id: z.uuid(),
  project_name: z.string(),
  width: z.number(),
  height: z.number(),
  blocks: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      kind: z.string(),
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
    }),
  ),
  shapes: z.array(
    z.object({
      unit_id: z.uuid(),
      unit_no: z.string(),
      block_id: z.uuid().nullable(),
      kind: z.enum(['plot', 'flat', 'villa', 'shop']),
      status: UNIT_STATUS,
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
    }),
  ),
});
