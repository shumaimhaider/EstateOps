import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useIdempotencyKey } from '@/shared/lib/useIdempotencyKey.js';
import { permissionsRepository } from '../data/permissions.repository.js';
import { permissionKeys } from './permissions.keys.js';

/** Saves the full permission list of one role. variables: { role, permissions }. */
export function useUpdateRolePermissionsMutation() {
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  return useMutation({
    mutationFn: ({ role, permissions }) =>
      permissionsRepository.updateRole(role, permissions, {
        idempotencyKey: idempotency.get({ role, permissions }),
      }),
    onSuccess: () => {
      idempotency.reset();
      return queryClient.invalidateQueries({ queryKey: permissionKeys.all });
    },
  });
}
