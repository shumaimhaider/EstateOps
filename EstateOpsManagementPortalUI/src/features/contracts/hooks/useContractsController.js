import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/shared/ui/toast/toastContext.js';
import { contractKeys } from './contracts.keys.js';
import {
  useContractActionMutation,
  useCreatePandaDocMutation,
  useStartSigningMutation,
  useUploadSignedContractMutation,
} from './useContractMutations.js';

/** Dialog state and mutations behind the contracts panel of one booking. */
export function useContractsController(bookingId) {
  const { t } = useTranslation('contracts');
  const toast = useToast();
  const upload = useUploadSignedContractMutation();
  const create = useCreatePandaDocMutation();
  const act = useContractActionMutation();
  const signing = useStartSigningMutation();
  const queryClient = useQueryClient();
  const [sign, setSign] = useState(null); // { contract, session }
  const [dialog, setDialog] = useState(null); // { type: 'upload'|'create'|'revise'|'void', contract? }
  const close = () => setDialog(null);
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: contractKeys.all }),
    [queryClient],
  );
  // The signer's choice reaches us twice: instantly from the signing page, and for real from
  // PandaDoc's webhook a moment later, so the list is refreshed a few times to catch the second.
  const signerFinished = useCallback(async () => {
    await refresh();
    for (const wait of [1500, 4000, 9000]) setTimeout(refresh, wait);
  }, [refresh]);
  const done = (key) => {
    toast.show({ tone: 'success', message: t(key) });
    close();
  };
  const failed = (error) =>
    toast.show({ tone: 'danger', message: t('actionFailed', { message: error.message }) });

  return {
    dialog,
    close,
    busy: act.isPending,
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
    signing: {
      contract: sign?.contract ?? null,
      session: sign?.session ?? null,
      loading: signing.isPending,
      error: signing.error,
      onEvent: (event) => signerFinished(sign.contract, event),
      close: () => {
        setSign(null);
        signing.reset();
      },
    },
    onSignNow: (contract) => {
      setSign({ contract, session: null });
      signing.mutate(
        { id: contract.id },
        { onSuccess: (session) => setSign({ contract, session }) },
      );
    },
  };
}
