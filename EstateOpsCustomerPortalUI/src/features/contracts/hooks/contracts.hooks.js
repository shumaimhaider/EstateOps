import { useMutation, useQuery } from '@tanstack/react-query';
import { contractsRepository as repo } from '../data/contracts.repository.js';

export const contractKeys = { list: (bookingId) => ['contracts', bookingId] };

export const useContractsQuery = (bookingId) =>
  useQuery({
    queryKey: contractKeys.list(bookingId),
    queryFn: ({ signal }) => repo.list(bookingId, { signal }),
    enabled: Boolean(bookingId),
  });

export const useStartSigningMutation = () =>
  useMutation({ mutationFn: (contractId) => repo.startSigning(contractId) });

export const useDownloadContractMutation = () =>
  useMutation({
    mutationFn: async (contract) => {
      const blob = await repo.download(contract.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${contract.title}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    },
  });
