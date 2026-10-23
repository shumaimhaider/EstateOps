import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import { issueUpload } from '../../files/application/uploads.js';

/** Step 1 of uploading a project's site map (an image or PDF of the plan). */
export class RequestProjectMapUpload {
  constructor({ uow, files }) {
    this.uow = uow;
    this.files = files;
  }

  async execute({ actor, projectId, filename, contentType, size }) {
    assertCan(actor, PERMISSION.INVENTORY_MANAGE);
    return this.uow.run(async (repos) => {
      if (!(await repos.projects.findById(actor.tenantId, projectId)))
        throw new NotFoundError('Project not found');
      return issueUpload({
        files: this.files,
        repos,
        actor,
        owner: { type: 'project', id: projectId },
        purpose: 'site_map',
        filename,
        contentType,
        size,
      });
    });
  }
}
