import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useIdempotencyKey } from '@/shared/lib/useIdempotencyKey.js';
import { contractsRepository } from '../data/contracts.repository.js';
import { contractKeys } from './contracts.keys.js';

function useContractMutation(run) {
  const queryClient = useQueryClient();
  const idempotency = useIdempotencyKey();
  return useMutation({
    mutationFn: (variables) =>
      run(variables, {
        idempotencyKey: idempotency.get({
          ...variables,
          file: variables.file ? [variables.file.name, variables.file.size] : undefined,
        }),
      }),
    onSuccess: () => {
      idempotency.reset();
      return queryClient.invalidateQueries({ queryKey: contractKeys.all });
    },
  });
}

/** variables: { bookingId, file, title } */
export const useUploadSignedContractMutation = () =>
  useContractMutation(({ bookingId, file, title }, opts) =>
    contractsRepository.uploadSigned(bookingId, { file, title }, opts),
  );

/** variables: { bookingId, template } */
export const useCreatePandaDocMutation = () =>
  useContractMutation(({ bookingId, template }, opts) =>
    contractsRepository.createPandaDoc(bookingId, { template }, opts),
  );

/** variables: { id, action: 'send' | 'void' | 'revise', note? } */
export const useContractActionMutation = () =>
  useContractMutation(({ id, action, note }, opts) =>
    action === 'revise'
      ? contractsRepository.revise(id, { note }, opts)
      : contractsRepository[action](id, opts),
  );

/** Opens an embedded signing session for a sent contract. variables: { id } */
export function useStartSigningMutation() {
  return useMutation({
    mutationFn: ({ id }) =>
      contractsRepository.startSigning(id, { idempotencyKey: crypto.randomUUID() }),
  });
}
