import { parseDto } from '@/shared/api/contract.js';
import { httpClient } from '@/shared/api/httpClient.js';
import { authFetch } from '@/shared/api/authLink.js';
import { config } from '@/shared/config/config.js';
import {
  contractDtoSchema,
  listDtoSchema,
  signingSessionDtoSchema,
} from '@/shared/api/dtos/property.dto.js';
import { contractFromApi, sessionFromApi } from '@/shared/api/dtos/property.mapper.js';

/** The customer's contracts: list per property, sign on screen, download the signed copy. */
export function createContractsRepository({ http = httpClient, fetcher = authFetch } = {}) {
  return {
    async list(bookingId, { signal } = {}) {
      const page = parseDto(
        listDtoSchema(contractDtoSchema),
        await http.get(`/portal/properties/${bookingId}/contracts`, { signal }),
        'contracts',
      );
      return page.data.map(contractFromApi);
    },
    async startSigning(contractId) {
      return sessionFromApi(
        parseDto(
          signingSessionDtoSchema,
          await http.post(`/portal/contracts/${contractId}/signing-session`, {}),
          'signing session',
        ),
      );
    },
    async download(contractId) {
      const response = await fetcher(`${config.apiBaseUrl}/portal/contracts/${contractId}/file`, {
        headers: { Accept: 'application/pdf' },
      });
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      return response.blob();
    },
  };
}

export const contractsRepository = createContractsRepository();
