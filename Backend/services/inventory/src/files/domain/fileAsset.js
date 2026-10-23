import { ConflictError, newId, validator } from '@estateops/kernel';

export const FILE_PURPOSE = Object.freeze({
  UNIT_IMAGE: 'unit_image',
  FLOOR_PLAN: 'floor_plan',
  SITE_MAP: 'site_map',
});
export const FILE_STATUS = Object.freeze({
  PENDING: 'pending',
  READY: 'ready',
  DELETED: 'deleted',
});

/**
 * A file that is about to be uploaded. Only identifying facts are kept; the storage key and the
 * public address are built from these fields elsewhere.
 */
export function createFileAsset(
  { tenantId, ownerType, ownerId, purpose, storedName, originalName, contentType, size, createdBy },
  { id = newId() } = {},
) {
  const v = validator('The file could not be accepted');
  v.check(Object.values(FILE_PURPOSE).includes(purpose), 'purpose', 'Unknown upload purpose');
  v.check(
    typeof originalName === 'string' && originalName.trim().length > 0,
    'filename',
    'Choose a file',
  );
  v.check(
    typeof contentType === 'string' && contentType.length > 0,
    'content_type',
    'File type is missing',
  );
  v.done();
  return {
    id,
    tenantId,
    ownerType,
    ownerId,
    purpose,
    storedName,
    originalName: originalName.trim().slice(0, 200),
    contentType,
    size,
    status: FILE_STATUS.PENDING,
    createdBy: createdBy ?? null,
  };
}

/** A pending upload becomes usable once the bytes are seen in storage. */
export function markReady(asset, stored) {
  if (asset.status !== FILE_STATUS.PENDING) {
    throw new ConflictError('UPLOAD_ALREADY_USED', 'This upload was already used');
  }
  const v = validator('The upload could not be confirmed');
  v.check(stored !== null, 'file', 'The file has not been uploaded yet');
  v.check(
    stored === null || stored.size === asset.size,
    'file',
    'The uploaded file does not match what was announced',
  );
  v.check(
    stored === null || stored.contentType === asset.contentType,
    'file',
    'The uploaded file type does not match',
  );
  v.done();
  return { ...asset, status: FILE_STATUS.READY };
}
