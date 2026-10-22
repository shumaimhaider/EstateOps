import { EVENT } from '@estateops/contracts';
import { createEventConsumerRouter, createServiceApp } from '@estateops/platform';
import { CreateProject } from '../projects/application/CreateProject.js';
import { DeleteProject } from '../projects/application/DeleteProject.js';
import { GetProject } from '../projects/application/GetProject.js';
import { GetProjectMap } from '../projects/application/GetProjectMap.js';
import { ListProjects } from '../projects/application/ListProjects.js';
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
}) {
  const deps = { uow, clock };
  const useCases = {
    listProjects: new ListProjects(deps),
    getProject: new GetProject(deps),
    createProject: new CreateProject(deps),
    updateProject: new UpdateProject(deps),
    deleteProject: new DeleteProject(deps),
    getProjectMap: new GetProjectMap(deps),
    getProjectStructure: new GetProjectStructure(deps),
    layoutProject: new LayoutProject(deps),
    createPhase: new CreatePhase(deps),
    deletePhase: new DeletePhase(deps),
    createBlock: new CreateBlock(deps),
    updateBlock: new UpdateBlock(deps),
    deleteBlock: new DeleteBlock(deps),
    createFloor: new CreateFloor(deps),
    deleteFloor: new DeleteFloor(deps),
    listUnits: new ListUnits(deps),
    getUnit: new GetUnit(deps),
    createUnit: new CreateUnit(deps),
    updateUnit: new UpdateUnit(deps),
    deleteUnit: new DeleteUnit(deps),
    actOnUnit: new ActOnUnit(deps),
    addUnitMedia: new AddUnitMedia(deps),
    removeUnitMedia: new RemoveUnitMedia(deps),
  };
  const handlers = {
    [EVENT.TENANT_UPSERTED]: (e) => new ApplyTenant(deps).execute(e),
    [EVENT.BOOKING_REQUESTED]: (e) => new ReserveUnit(deps).execute(e),
    [EVENT.BOOKING_COMPLETED]: (e) => new FollowBooking({ ...deps, mode: 'sell' }).execute(e),
    [EVENT.BOOKING_CANCELLED]: (e) => new FollowBooking({ ...deps, mode: 'release' }).execute(e),
  };

  return createServiceApp({
    name: 'inventory',
    logger,
    verifier,
    internalToken,
    idempotencyStore,
    readyCheck,
    adminRouters: [
      createProjectRoutes(useCases),
      createStructureRoutes(useCases),
      createUnitRoutes(useCases),
    ],
    internalRouters: [createEventConsumerRouter({ handlers, logger })],
  });
}
