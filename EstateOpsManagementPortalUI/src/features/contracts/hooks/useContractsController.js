import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/shared/ui/toast/toastContext.js';
import {
  useContractActionMutation,
  useCreatePandaDocMutation,
  useSimulateContractEventMutation,
  useUploadSignedContractMutation,
} from './useContractMutations.js';

/** Dialog state and mutations behind the contracts panel of one booking. */
export function useContractsController(bookingId) {
  const { t } = useTranslation('contracts');
  const toast = useToast();
  const upload = useUploadSignedContractMutation();
  const create = useCreatePandaDocMutation();
  const act = useContractActionMutation();
  const simulate = useSimulateContractEventMutation();
  const [dialog, setDialog] = useState(null); // { type: 'upload'|'create'|'revise'|'void', contract? }
  const close = () => setDialog(null);
  const done = (key) => {
    toast.show({ tone: 'success', message: t(key) });
    close();
  };
  const failed = (error) =>
    toast.show({ tone: 'danger', message: t('actionFailed', { message: error.message }) });

  return {
    dialog,
    close,
    busy: act.isPending || simulate.isPending,
    creating: create.isPending,
    openUpload: () => setDialog({ type: 'upload' }),
    openCreate: () => setDialog({ type: 'create' }),
    onUpload: async ({ file, title }) => {
      await upload.mutateAsync({ bookingId, file, title });
      done('upload.done');
    },
    onCreate: (template) =>
      create.mutateAsync({ bookingId, template }).then(() => done('create.done'), failed),
    onAction: (action, contract) => {
      if (action === 'send') {
        act.mutate(
          { id: contract.id, action },
          { onSuccess: () => done('actions.sent'), onError: failed },
        );
      } else setDialog({ type: action, contract });
    },
    onRevise: async ({ contract, note }) => {
      await act.mutateAsync({ id: contract.id, action: 'revise', note });
      done('revise.done');
    },
    onVoid: (contract) =>
      act
        .mutateAsync({ id: contract.id, action: 'void' })
        .then(() => done('actions.voided'), failed),
    onSimulate: (contract, event) =>
      simulate.mutate({ id: contract.id, event }, { onError: failed }),
  };
}
