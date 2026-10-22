import { z } from 'zod';

export const createPhaseRequest = z.object({ name: z.string() });
export const createBlockRequest = z.object({
  name: z.string(),
  kind: z.string(),
  phase_id: z.uuid().nullable().optional(),
});
export const updateBlockRequest = z
  .object({
    name: z.string().optional(),
    kind: z.string().optional(),
    phase_id: z.uuid().nullable().optional(),
  })
  .strict();
export const createFloorRequest = z.object({
  number: z.number().int(),
  label: z.string().optional(),
});

export const toPhaseResponse = (p) => ({ id: p.id, project_id: p.projectId, name: p.name });
export const toBlockResponse = (b) => ({
  id: b.id,
  project_id: b.projectId,
  phase_id: b.phaseId,
  name: b.name,
  kind: b.kind,
});
export const toFloorResponse = (f) => ({
  id: f.id,
  block_id: f.blockId,
  number: f.number,
  label: f.label,
});
export const toStructureResponse = ({ phases, blocks, floors }) => ({
  phases: phases.map(toPhaseResponse),
  blocks: blocks.map(toBlockResponse),
  floors: floors.map(toFloorResponse),
});
