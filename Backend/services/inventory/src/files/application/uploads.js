import { NotFoundError, fieldError } from '@estateops/kernel';
import { createFileAsset } from '../domain/fileAsset.js';

/**
 * Shared by the use cases that hand out upload URLs: checks type and size against the policy,
 * stores a pending file row and signs a PUT URL for the browser.
 */
export async function issueUpload({
  files,
  repos,
  actor,
  owner,
  purpose,
  filename,
  contentType,
  size,
}) {
  const problem = files.checkUpload(purpose, { contentType, size });
  if (problem) throw fieldError('file', problem, 'The file could not be accepted');
  const asset = createFileAsset({
    tenantId: actor.tenantId,
    ownerType: owner.type,
    ownerId: owner.id,
    purpose,
    storedName: files.safeFileName(filename),
    originalName: filename,
    contentType,
    size,
    createdBy: actor.userId ?? null,
  });
  await repos.fileAssets.insert(asset);
  const upload = files.storage.signUpload(files.objectKey(asset), { contentType });
  return { assetId: asset.id, upload };
}

/** A pending upload of this owner and purpose, or NotFound. */
export async function pendingUpload({ repos, actor, assetId, owner, purposes }) {
  const asset = await repos.fileAssets.findById(actor.tenantId, assetId);
  if (
    !asset ||
    asset.ownerType !== owner.type ||
    asset.ownerId !== owner.id ||
    !purposes.includes(asset.purpose)
  ) {
    throw new NotFoundError('Upload not found');
  }
  return asset;
}
