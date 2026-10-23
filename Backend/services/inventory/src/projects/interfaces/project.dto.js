import { z } from 'zod';
import { toIso } from '@estateops/kernel';

export const createProjectRequest = z.object({
  name: z.string(),
  location: z.string().optional(),
  kind: z.string(),
});

export const updateProjectRequest = z
  .object({
    name: z.string().optional(),
    location: z.string().optional(),
    kind: z.string().optional(),
  })
  .strict();

export const listQuery = z.object({ cursor: z.string().optional(), limit: z.string().optional() });

export const toProjectResponse = ({ project, unitCounts, unitsTotal, allowedActions = [] }) => ({
  id: project.id,
  tenant_id: project.tenantId,
  name: project.name,
  location: project.location,
  kind: project.kind,
  units_total: unitsTotal,
  unit_counts: unitCounts,
  allowed_actions: allowedActions,
  created_at: toIso(project.createdAt),
  updated_at: toIso(project.updatedAt),
  created_by: project.createdBy,
});

/** A project right after create or update, before any units exist. */
export const toBareProjectResponse = (project) =>
  toProjectResponse({
    project,
    unitCounts: { available: 0, held: 0, booked: 0, sold: 0, blocked: 0 },
    unitsTotal: 0,
    allowedActions: ['update', 'delete'],
  });

export const uploadUrlRequest = z.object({
  filename: z.string().min(1).max(200),
  content_type: z.string(),
  size: z.number().int(),
});
export const confirmMapRequest = z.object({ asset_id: z.string() });

export const toMapResponse = (
  { project, width, height, blocks, shapes, mapAsset = null },
  fileUrl = () => null,
) => ({
  project_id: project.id,
  project_name: project.name,
  width,
  height,
  image_url: fileUrl(mapAsset),
  image_name: mapAsset?.originalName ?? null,
  blocks: blocks.map((b) => ({
    id: b.id,
    name: b.name,
    kind: b.kind,
    x: b.geometry.x,
    y: b.geometry.y,
    w: b.geometry.w,
    h: b.geometry.h,
  })),
  shapes: shapes.map((s) => ({
    unit_id: s.unitId,
    unit_no: s.unitNo,
    block_id: s.blockId,
    kind: s.kind,
    status: s.status,
    x: s.x,
    y: s.y,
    w: s.w,
    h: s.h,
  })),
});
