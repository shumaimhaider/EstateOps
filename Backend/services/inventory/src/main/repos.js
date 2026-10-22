import { ProjectRepositoryTypeorm } from '../projects/infrastructure/ProjectRepositoryTypeorm.js';
import { BlockRow, FloorRow, PhaseRow, ProjectRow } from '../projects/infrastructure/entities.js';
import { StructureRepositoryTypeorm } from '../structure/infrastructure/StructureRepositoryTypeorm.js';
import { TenantRefRepositoryTypeorm } from '../tenants/infrastructure/TenantRefRepositoryTypeorm.js';
import { UnitRow } from '../units/infrastructure/entities.js';
import { UnitRepositoryTypeorm } from '../units/infrastructure/UnitRepositoryTypeorm.js';
import {
  UnitHistoryRepositoryTypeorm,
  UnitMediaRepositoryTypeorm,
} from '../units/infrastructure/UnitSideRepositories.js';

export const ENTITIES = [ProjectRow, PhaseRow, BlockRow, FloorRow, UnitRow];

/** The inventory repositories bound to one transaction's EntityManager. */
export const buildRepos = (manager) => ({
  projects: new ProjectRepositoryTypeorm(manager),
  structure: new StructureRepositoryTypeorm(manager),
  units: new UnitRepositoryTypeorm(manager),
  unitHistory: new UnitHistoryRepositoryTypeorm(manager),
  unitMedia: new UnitMediaRepositoryTypeorm(manager),
  tenantRefs: new TenantRefRepositoryTypeorm(manager),
});
