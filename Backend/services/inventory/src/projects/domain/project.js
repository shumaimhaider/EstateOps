import { isNonEmptyString, newId, validator } from '@estateops/kernel';

export const PROJECT_KINDS = Object.freeze(['plot_society', 'tower', 'mixed']);

function check({ name, location, kind }) {
  const v = validator('The project could not be saved');
  if (name !== undefined) v.check(isNonEmptyString(name, 120), 'name', 'Name is required');
  if (location !== undefined)
    v.check(
      typeof location === 'string' && location.length <= 200,
      'location',
      'Location is too long',
    );
  if (kind !== undefined)
    v.check(PROJECT_KINDS.includes(kind), 'kind', 'Choose plot society, tower or mixed');
  v.done();
}

export function createProject(
  { tenantId, name, location = '', kind, createdBy = null },
  { id = newId() } = {},
) {
  check({ name: name ?? '', location, kind: kind ?? '' });
  return {
    id,
    tenantId,
    name: name.trim(),
    location: location.trim(),
    kind,
    createdBy,
    version: 1,
  };
}

export function updateProject(project, patch) {
  check({ name: patch.name, location: patch.location, kind: patch.kind });
  return {
    ...project,
    name: patch.name !== undefined ? patch.name.trim() : project.name,
    location: patch.location !== undefined ? patch.location.trim() : project.location,
    kind: patch.kind ?? project.kind,
  };
}
