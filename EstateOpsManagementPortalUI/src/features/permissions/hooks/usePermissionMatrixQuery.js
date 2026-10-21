import { useQuery } from '@tanstack/react-query';
import { permissionsRepository } from '../data/permissions.repository.js';
import { permissionKeys } from './permissions.keys.js';

export function usePermissionMatrixQuery() {
  return useQuery({
    queryKey: permissionKeys.matrix(),
    queryFn: ({ signal }) => permissionsRepository.list({ signal }),
    staleTime: 30_000,
  });
}
