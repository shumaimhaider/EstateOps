import { useTranslation } from 'react-i18next';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import { useToast } from '@/shared/ui/toast/toastContext.js';
import { usePermissionMatrixQuery } from '../hooks/usePermissionMatrixQuery.js';
import { useUpdateRolePermissionsMutation } from '../hooks/useUpdateRolePermissionsMutation.js';
import PermissionMatrix from './PermissionMatrix.jsx';

/** Loads the role/permission matrix and saves each change. */
export default function RolePermissionsEditor() {
  const { t } = useTranslation('permissions');
  const toast = useToast();
  const query = usePermissionMatrixQuery();
  const update = useUpdateRolePermissionsMutation();

  if (query.isPending) return <Skeleton rows={8} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const toggle = ({ role, permissions }, key, granted) => {
    const next = granted ? [...permissions, key] : permissions.filter((p) => p !== key);
    update.mutate(
      { role, permissions: next },
      {
        onSuccess: () =>
          toast.show({ tone: 'success', message: t('saved', { role: t(`auth:roles.${role}`) }) }),
        onError: (error) =>
          toast.show({ tone: 'danger', message: t('saveFailed', { message: error.message }) }),
      },
    );
  };

  return (
    <PermissionMatrix
      matrix={query.data}
      busyRoles={update.isPending ? [update.variables.role] : []}
      onToggle={toggle}
    />
  );
}
