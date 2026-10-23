import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { markReady } from '../../files/domain/fileAsset.js';
import { pendingUpload } from '../../files/application/uploads.js';

/** Step 2: the map is in storage; it becomes the project's current site map (older ones are retired). */
export class ConfirmProjectMap {
  constructor({ uow, files }) {
    this.uow = uow;
    this.files = files;
  }

  async execute({ actor, projectId, assetId }) {
    assertCan(actor, PERMISSION.INVENTORY_MANAGE);
    const { ready, previous } = await this.uow.run(async (repos) => {
      if (!(await repos.projects.findById(actor.tenantId, projectId)))
        throw new NotFoundError('Project not found');
      const pending = await pendingUpload({
        repos,
        actor,
        assetId,
        owner: { type: 'project', id: projectId },
        purposes: ['site_map'],
      });
      const done = markReady(pending, await this.files.storage.head(this.files.objectKey(pending)));
      const old = await repos.fileAssets.latestReady(
        actor.tenantId,
        'project',
        projectId,
        'site_map',
      );
      await repos.fileAssets.setStatus(actor.tenantId, done.id, done.status);
      if (old) await repos.fileAssets.setStatus(actor.tenantId, old.id, 'deleted');
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'project.map_upload',
        subjectType: 'project',
        subjectId: projectId,
        before: { file: old?.originalName ?? null },
        after: { file: done.originalName },
      });
      return { ready: done, previous: old };
    });
    if (previous) await this.files.storage.remove(this.files.objectKey(previous)).catch(() => {});
    return ready;
  }
}
