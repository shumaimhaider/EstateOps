import { z } from 'zod';
import { toIso } from '@estateops/kernel';

const optionalText = z.string().nullable().optional();

export const createUnitRequest = z.object({
  project_id: z.uuid(),
  unit_no: z.string(),
  kind: z.string(),
  area_value: z.number(),
  area_unit: z.string(),
  bedrooms: z.number().int().nullable().optional(),
  facing: optionalText,
  view: optionalText,
  corner: z.boolean().optional(),
  parking: z.number().int().optional(),
  list_price: z.number(),
  currency: z.string(),
  phase_id: z.uuid().nullable().optional(),
  block_id: z.uuid().nullable().optional(),
  floor_id: z.uuid().nullable().optional(),
});

export const updateUnitRequest = z
  .object({
    unit_no: z.string().optional(),
    kind: z.string().optional(),
    area_value: z.number().optional(),
    area_unit: z.string().optional(),
    bedrooms: z.number().int().nullable().optional(),
    facing: optionalText,
    view: optionalText,
    corner: z.boolean().optional(),
    parking: z.number().int().optional(),
    list_price: z.number().optional(),
  })
  .strict();

export const listUnitsQuery = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  kind: z.string().optional(),
  project_id: z.string().optional(),
  sort: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.string().optional(),
});

export const uploadUrlRequest = z.object({
  kind: z.string().optional(),
  filename: z.string().min(1).max(200),
  content_type: z.string(),
  size: z.number().int(),
});

export const createMediaRequest = z.object({
  kind: z.string(),
  asset_id: z.string(),
  caption: z.string().nullable().optional(),
});

export const toUploadResponse = ({ assetId, upload }) => ({
  asset_id: assetId,
  upload: {
    method: upload.method,
    url: upload.url,
    headers: upload.headers,
    expires_in: upload.expiresIn,
  },
});

/** Wire request -> the domain's camelCase fields. Only fields that were sent are included. */
export function toUnitFields(body) {
  const map = {
    unit_no: 'unitNo',
    kind: 'kind',
    area_value: 'areaValue',
    area_unit: 'areaUnit',
    bedrooms: 'bedrooms',
    facing: 'facing',
    view: 'view',
    corner: 'corner',
    parking: 'parking',
    list_price: 'listPrice',
    currency: 'currency',
  };
  return Object.fromEntries(
    Object.entries(map)
      .filter(([wire]) => body[wire] !== undefined)
      .map(([wire, field]) => [field, body[wire]]),
  );
}

export const toPlacement = (body) => ({
  phaseId: body.phase_id ?? null,
  blockId: body.block_id ?? null,
  floorId: body.floor_id ?? null,
});

/** `fileUrl` turns the file's columns into its public address: the only place that knows the host. */
export const toMediaResponse = (m, fileUrl) => ({
  id: m.id,
  kind: m.kind,
  url: fileUrl(m.asset),
  file_name: m.asset?.originalName ?? null,
  caption: m.caption ?? '',
});

/** One unit in the shape the UI expects. `view` carries joined names, `detail` the history and pictures. */
export function toUnitResponse({
  unit,
  projectName,
  blockName,
  floorLabel,
  allowedActions,
  history,
  media,
  fileUrl = () => null,
}) {
  return {
    id: unit.id,
    tenant_id: unit.tenantId,
    project_id: unit.projectId,
    project_name: projectName ?? '',
    phase_id: unit.phaseId,
    block_id: unit.blockId,
    block_name: blockName ?? null,
    floor_id: unit.floorId,
    floor_label: floorLabel ?? null,
    unit_no: unit.unitNo,
    kind: unit.kind,
    area_value: unit.areaValue,
    area_unit: unit.areaUnit,
    bedrooms: unit.bedrooms,
    facing: unit.facing,
    view: unit.view,
    corner: unit.corner,
    parking: unit.parking,
    attributes: unit.attributes,
    status: unit.status,
    list_price: unit.listPrice,
    currency: unit.currency,
    geometry: unit.geometry,
    allowed_actions: allowedActions,
    booking_id: unit.bookingId,
    ...(media ? { media: media.map((m) => toMediaResponse(m, fileUrl)) } : {}),
    ...(history
      ? {
          status_history: history.map((h) => ({
            status: h.status,
            changed_by: h.changedBy,
            changed_by_name: h.changedByName,
            changed_at: toIso(h.changedAt),
          })),
        }
      : {}),
    created_at: toIso(unit.createdAt),
    updated_at: toIso(unit.updatedAt),
    created_by: unit.createdBy,
  };
}
