import { useMutation, useQueryClient } from '@tanstack/react-query';
import { newIdempotencyKey } from '@/shared/lib/idempotencyKey.js';
import { mediaRepository } from '../data/media.repository.js';
import { unitKeys } from './unit.keys.js';

/** Upload a picture: signed URL, direct upload, attach. Refreshes the unit afterwards. */
export function useAddUnitPictureMutation(unitId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values) =>
      mediaRepository.addUnitPicture(unitId, values, { idempotencyKey: newIdempotencyKey() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: unitKeys.detail(unitId) }),
  });
}

export function useRemoveUnitPictureMutation(unitId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mediaId) =>
      mediaRepository.removeUnitPicture(unitId, mediaId, { idempotencyKey: newIdempotencyKey() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: unitKeys.detail(unitId) }),
  });
}
