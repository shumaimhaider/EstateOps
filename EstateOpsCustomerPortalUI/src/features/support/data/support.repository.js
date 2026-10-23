import { parseDto } from '@/shared/api/contract.js';
import { httpClient } from '@/shared/api/httpClient.js';
import { listDtoSchema } from '@/shared/api/dtos/property.dto.js';
import { requestDtoSchema, threadDtoSchema } from '@/shared/api/dtos/support.dto.js';
import { requestFromApi, threadFromApi } from '@/shared/api/dtos/support.mapper.js';

/** The customer's conversations with the developer's support team. */
export function createSupportRepository({ http = httpClient } = {}) {
  return {
    async list({ cursor, signal } = {}) {
      const page = parseDto(
        listDtoSchema(requestDtoSchema),
        await http.get('/portal/support-requests', { query: { cursor }, signal }),
        'support requests',
      );
      return { items: page.data.map(requestFromApi), nextCursor: page.next_cursor };
    },
    async get(id, { signal } = {}) {
      return threadFromApi(
        parseDto(
          threadDtoSchema,
          await http.get(`/portal/support-requests/${id}`, { signal }),
          'support request',
        ),
      );
    },
    async create({ subject, message, bookingId }) {
      const body = { subject, message, ...(bookingId && { booking_id: bookingId }) };
      return threadFromApi(
        parseDto(
          threadDtoSchema,
          await http.post('/portal/support-requests', body),
          'support request',
        ),
      );
    },
    async reply(id, message) {
      return threadFromApi(
        parseDto(
          threadDtoSchema,
          await http.post(`/portal/support-requests/${id}/messages`, { message }),
          'support request',
        ),
      );
    },
  };
}

export const supportRepository = createSupportRepository();
