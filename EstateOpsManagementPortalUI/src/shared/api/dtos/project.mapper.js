/**
 * @typedef {import('../../../features/inventory/domain/project.model.js').Project} Project
 * @typedef {import('../../../features/inventory/domain/project.model.js').ProjectMap} ProjectMap
 * @param {import('./project.dto.js').ProjectDto} dto
 * @returns {Project}
 */
export function fromApi(dto) {
  return {
    id: dto.id,
    tenantId: dto.tenant_id,
    name: dto.name,
    location: dto.location,
    kind: dto.kind,
    unitsTotal: dto.units_total,
    unitCounts: {
      available: dto.unit_counts.available ?? 0,
      held: dto.unit_counts.held ?? 0,
      booked: dto.unit_counts.booked ?? 0,
      sold: dto.unit_counts.sold ?? 0,
      blocked: dto.unit_counts.blocked ?? 0,
    },
    allowedActions: dto.allowed_actions,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    createdBy: dto.created_by,
  };
}

export const fromApiList = (dtos) => dtos.map(fromApi);

/** @returns {ProjectMap} */
export function mapFromApi(dto) {
  return {
    projectId: dto.project_id,
    projectName: dto.project_name,
    width: dto.width,
    height: dto.height,
    imageUrl: dto.image_url ?? null,
    imageName: dto.image_name ?? null,
    blocks: dto.blocks.map((b) => ({
      id: b.id,
      name: b.name,
      kind: b.kind,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
    })),
    shapes: dto.shapes.map((s) => ({
      unitId: s.unit_id,
      unitNo: s.unit_no,
      blockId: s.block_id,
      kind: s.kind,
      status: s.status,
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
    })),
  };
}
