import { useMutation, useQueryClient } from '@tanstack/react-query';
import { newIdempotencyKey } from '@/shared/lib/idempotencyKey.js';
import { mediaRepository } from '../data/media.repository.js';
import { projectKeys } from './unit.keys.js';

/** Upload a site map image for a project; the map query refreshes with the new picture. */
export function useUploadProjectMapMutation(projectId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file }) =>
      mediaRepository.uploadProjectMap(
        projectId,
        { file },
        { idempotencyKey: newIdempotencyKey() },
      ),
    onSuccess: (map) => queryClient.setQueryData([...projectKeys.all, 'map', projectId], map),
  });
}
