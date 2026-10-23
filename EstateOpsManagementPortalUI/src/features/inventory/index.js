/** Public surface of the inventory feature. Nothing else in the feature may be imported. */
export { default as UnitsTable } from './components/UnitsTable.jsx';
export { default as UnitFilters } from './components/UnitFilters.jsx';
export { default as UnitFormDialog } from './components/UnitFormDialog.jsx';
export { default as UnitActions } from './components/UnitActions.jsx';
export { default as UnitDetailPanel } from './components/UnitDetailPanel.jsx';
export { default as ProjectCard } from './components/ProjectCard.jsx';
export { default as UnitPicturesManager } from './components/UnitPicturesManager.jsx';
export { default as ProjectMapUpload } from './components/ProjectMapUpload.jsx';
export { default as ProjectMap } from './components/ProjectMap.jsx';
export { default as UnitStatusPill } from './components/UnitStatusPill.jsx';

export { useUnitsQuery } from './hooks/useUnitsQuery.js';
export { useUnitQuery } from './hooks/useUnitQuery.js';
export { useProjectsQuery } from './hooks/useProjectsQuery.js';
export { useProjectQuery } from './hooks/useProjectQuery.js';
export { useProjectMapQuery } from './hooks/useProjectMapQuery.js';
export { useCreateUnitMutation } from './hooks/useCreateUnitMutation.js';
export { useUnitActionHandler } from './hooks/useUnitActionHandler.js';
export { useUnitFilters } from './hooks/useUnitFilters.js';
export { unitKeys, projectKeys } from './hooks/unit.keys.js';

export * from './domain/unit.constants.js';
export { unitShape } from './domain/unit.model.js';
export { projectShape } from './domain/project.model.js';
