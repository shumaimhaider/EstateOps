import { NotFoundError, PERMISSION, assertCan, noCache } from '@estateops/kernel';
import { MAP_HEIGHT, MAP_WIDTH } from '../../layout/domain/layout.js';

/** Site plan: the uploaded map picture (if any), block outlines and one shape per unit coloured by live status. */
export class GetProjectMap {
  /** The site map is polled every 15 s by every open page, so it is cached for a few seconds and dropped when units change. */
  constructor({ uow, cache = noCache }) {
    Object.assign(this, { uow, cache });
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.PROJECTS_VIEW);
    // a missing project throws, which is never cached
    return this.cache.remember(
      { ns: 'projects', tenantId: actor.tenantId, key: `map:${id}`, ttlMs: 10_000 },
      () => this.#load(actor, id),
    );
  }

  #load(actor, id) {
    return this.uow.read(async (repos) => {
      const project = await repos.projects.findById(actor.tenantId, id);
      if (!project) throw new NotFoundError('Project not found');
      const blocks = await repos.structure.listBlocks(actor.tenantId, id);
      const shapes = await repos.units.listShapes(actor.tenantId, id);
      return {
        project,
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
        blocks: blocks.filter((b) => b.geometry),
        shapes,
        mapAsset: await repos.fileAssets.latestReady(actor.tenantId, 'project', id, 'site_map'),
      };
    });
  }
}
