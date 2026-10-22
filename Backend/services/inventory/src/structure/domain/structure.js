import { isNonEmptyString, newId, validator } from '@estateops/kernel';

export const BLOCK_KINDS = Object.freeze(['plot_block', 'building']);

const nameCheck = (name, summary) => {
  const v = validator(summary);
  v.check(isNonEmptyString(name, 80), 'name', 'Name is required');
  v.done();
};

export function createPhase({ tenantId, projectId, name }, { id = newId() } = {}) {
  nameCheck(name ?? '', 'The phase could not be saved');
  return { id, tenantId, projectId, name: name.trim() };
}

export function createBlock(
  { tenantId, projectId, phaseId = null, name, kind },
  { id = newId() } = {},
) {
  const v = validator('The block could not be saved');
  v.check(isNonEmptyString(name ?? '', 80), 'name', 'Name is required');
  v.check(BLOCK_KINDS.includes(kind), 'kind', 'Choose plot block or building');
  v.done();
  return { id, tenantId, projectId, phaseId, name: name.trim(), kind, geometry: null };
}

export function updateBlock(block, patch) {
  const v = validator('The block could not be saved');
  if (patch.name !== undefined)
    v.check(isNonEmptyString(patch.name, 80), 'name', 'Name is required');
  if (patch.kind !== undefined)
    v.check(BLOCK_KINDS.includes(patch.kind), 'kind', 'Choose plot block or building');
  v.done();
  return {
    ...block,
    name: patch.name !== undefined ? patch.name.trim() : block.name,
    kind: patch.kind ?? block.kind,
    phaseId: patch.phaseId !== undefined ? patch.phaseId : block.phaseId,
  };
}

export function createFloor({ tenantId, blockId, number, label }, { id = newId() } = {}) {
  const v = validator('The floor could not be saved');
  v.check(
    Number.isInteger(number) && number >= 0 && number <= 200,
    'number',
    'Floor number must be 0 to 200',
  );
  v.check(label === undefined || isNonEmptyString(label, 40), 'label', 'Label is too long');
  v.done();
  return { id, tenantId, blockId, number, label: label?.trim() || `Floor ${number}` };
}
