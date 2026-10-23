import { EVENT } from '@estateops/contracts';
import { noCache } from '@estateops/kernel';
import { createEventConsumerRouter, createServiceApp } from '@estateops/platform';
import { CreateProject } from '../projects/application/CreateProject.js';
import { DeleteProject } from '../projects/application/DeleteProject.js';
import { GetProject } from '../projects/application/GetProject.js';
import { GetProjectMap } from '../projects/application/GetProjectMap.js';
import { ListProjects } from '../projects/application/ListProjects.js';
import { ConfirmProjectMap } from '../projects/application/ConfirmProjectMap.js';
import { RequestProjectMapUpload } from '../projects/application/RequestProjectMapUpload.js';
import { UpdateProject } from '../projects/application/UpdateProject.js';
import { createProjectRoutes } from '../projects/interfaces/projectRoutes.js';
import { LayoutProject } from '../layout/application/LayoutProject.js';
import { CreateBlock } from '../structure/application/CreateBlock.js';
import { CreateFloor } from '../structure/application/CreateFloor.js';
import { CreatePhase } from '../structure/application/CreatePhase.js';
import { DeleteBlock } from '../structure/application/DeleteBlock.js';
import { DeleteFloor } from '../structure/application/DeleteFloor.js';
import { DeletePhase } from '../structure/application/DeletePhase.js';
import { GetProjectStructure } from '../structure/application/GetProjectStructure.js';
import { UpdateBlock } from '../structure/application/UpdateBlock.js';
import { createStructureRoutes } from '../structure/interfaces/structureRoutes.js';
import { ApplyTenant } from '../tenants/application/ApplyTenant.js';
import { ActOnUnit } from '../units/application/ActOnUnit.js';
import { AddUnitMedia } from '../units/application/AddUnitMedia.js';
import { CreateUnit } from '../units/application/CreateUnit.js';
import { DeleteUnit } from '../units/application/DeleteUnit.js';
import { FollowBooking } from '../units/application/FollowBooking.js';
import { GetUnit } from '../units/application/GetUnit.js';
import { ListUnits } from '../units/application/ListUnits.js';
import { RequestUnitMediaUpload } from '../units/application/RequestUnitMediaUpload.js';
import { RemoveUnitMedia } from '../units/application/RemoveUnitMedia.js';
import { ReserveUnit } from '../units/application/ReserveUnit.js';
import { UpdateUnit } from '../units/application/UpdateUnit.js';
import { createUnitRoutes } from '../units/interfaces/unitRoutes.js';

/** Composition root of the inventory service. */
export function composeInventory({
  uow,
  clock,
  verifier,
  logger,
  internalToken,
  idempotencyStore = null,
  readyCheck,
  files,
  cache = noCache,
}) {
  const deps = { uow, clock, files };
  // a change made through the API drops what was cached for the tenant, on every replica
  const invalidating = (useCase) => ({
    execute: async (input) => {
      const result = await useCase.execute(input);
      await cache.bump('projects', input.actor.tenantId);
      return result;
    },
  });
  const routeDeps = { fileUrl: files.fileUrl };
  const useCases = {
    listProjects: new ListProjects({ ...deps, cache }),
    getProject: new GetProject(deps),
    createProject: invalidating(new CreateProject(deps)),
    updateProject: invalidating(new UpdateProject(deps)),
    deleteProject: invalidating(new DeleteProject(deps)),
    getProjectMap: new GetProjectMap({ ...deps, cache }),
    getProjectStructure: new GetProjectStructure(deps),
    layoutProject: invalidating(new LayoutProject(deps)),
    createPhase: invalidating(new CreatePhase(deps)),
    deletePhase: invalidating(new DeletePhase(deps)),
    createBlock: invalidating(new CreateBlock(deps)),
    updateBlock: invalidating(new UpdateBlock(deps)),
    deleteBlock: invalidating(new DeleteBlock(deps)),
    createFloor: invalidating(new CreateFloor(deps)),
    deleteFloor: invalidating(new DeleteFloor(deps)),
    listUnits: new ListUnits(deps),
    getUnit: new GetUnit(deps),
    createUnit: invalidating(new CreateUnit(deps)),
    updateUnit: invalidating(new UpdateUnit(deps)),
    deleteUnit: invalidating(new DeleteUnit(deps)),
    actOnUnit: invalidating(new ActOnUnit(deps)),
    requestUnitMediaUpload: new RequestUnitMediaUpload(deps),
    requestProjectMapUpload: new RequestProjectMapUpload(deps),
    confirmProjectMap: invalidating(new ConfirmProjectMap(deps)),
    addUnitMedia: new AddUnitMedia(deps),
    removeUnitMedia: new RemoveUnitMedia(deps),
  };
  const handlers = {
    [EVENT.TENANT_UPSERTED]: (e) => new ApplyTenant(deps).execute(e),
    // unit and project facts changed (booked, sold, edited): refresh the cached lists and maps
    [EVENT.UNIT_UPSERTED]: (e) => cache.bump('projects', e.tenant_id),
    [EVENT.PROJECT_UPSERTED]: (e) => cache.bump('projects', e.tenant_id),
    [EVENT.BOOKING_REQUESTED]: (e) => new ReserveUnit(deps).execute(e),
    [EVENT.BOOKING_COMPLETED]: (e) => new FollowBooking({ ...deps, mode: 'sell' }).execute(e),
    [EVENT.BOOKING_CANCELLED]: (e) => new FollowBooking({ ...deps, mode: 'release' }).execute(e),
  };

  const app = createServiceApp({
    name: 'inventory',
    logger,
    verifier,
    internalToken,
    idempotencyStore,
    readyCheck,
    adminRouters: [
      createProjectRoutes(useCases, routeDeps),
      createStructureRoutes(useCases),
      createUnitRoutes(useCases, routeDeps),
    ],
    internalRouters: [createEventConsumerRouter({ handlers, logger })],
  });
  return Object.assign(app, { handlers });
}
