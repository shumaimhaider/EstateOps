import { unitUpserted } from '../../projects/application/events.js';

/** Tells other services about a unit's current facts and status (a full snapshot, order-safe). */
export async function announceUnit({ repos, unit, clock }) {
  const project = await repos.projects.findById(unit.tenantId, unit.projectId);
  await repos.outbox.add(unitUpserted(unit, project?.name ?? '', clock.now()));
}

/** Staff actions the role may take now: the state allows them and the role holds inventory.manage. */
export { staffActions } from '../domain/unit.js';
