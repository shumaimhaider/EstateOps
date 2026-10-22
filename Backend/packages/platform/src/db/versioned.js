import { ConflictError, NotFoundError } from '@estateops/kernel';

/**
 * Optimistic-lock update: changes the row only if its `version` still matches, and bumps it.
 * Two people editing the same record cannot silently overwrite each other.
 * @returns the new version number
 */
export async function updateVersioned(
  manager,
  entity,
  { where, version, set, versionColumn = 'version' },
) {
  const result = await manager
    .createQueryBuilder()
    .update(entity)
    .set({ ...set, updated_at: () => 'now()', [versionColumn]: () => `${versionColumn} + 1` })
    .where({ ...where, [versionColumn]: version })
    .returning(versionColumn)
    .execute();
  if (!result.affected) {
    const exists = await manager.getRepository(entity).existsBy(where);
    if (!exists) throw new NotFoundError('Record not found');
    throw new ConflictError(
      'VERSION_CONFLICT',
      'Someone else changed this record. Reload and try again.',
    );
  }
  return result.raw[0][versionColumn];
}
