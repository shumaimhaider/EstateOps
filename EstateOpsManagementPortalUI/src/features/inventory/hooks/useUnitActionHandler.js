import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getErrorInfo } from '@/shared/lib/errors.js';
import { useToast } from '@/shared/ui/toast/toastContext.js';
import { useUnitActionMutation } from './useUnitActionMutation.js';

/** Runs a unit action and reports the outcome with a toast. Shared by list and detail pages. */
export function useUnitActionHandler() {
  const { t } = useTranslation('inventory');
  const toast = useToast();
  const mutation = useUnitActionMutation();

  const handleAction = useCallback(
    async (unit, action) => {
      try {
        await mutation.mutateAsync({ id: unit.id, action });
        toast.show({
          tone: 'success',
          message: t(action === 'block' ? 'actions.doneBlock' : 'actions.doneUnblock', {
            unitNo: unit.unitNo,
          }),
        });
      } catch (error) {
        toast.show({
          tone: 'danger',
          message: t('actions.failed', { message: getErrorInfo(error).message }),
        });
      }
    },
    [mutation, toast, t],
  );

  return { handleAction, isPending: mutation.isPending };
}
