import { parseDto } from '@/shared/api/contract.js';
import { httpClient } from '@/shared/api/httpClient.js';
import {
  portalAccessDtoSchema,
  supportPageDtoSchema,
  supportThreadDtoSchema,
} from '@/shared/api/dtos/support.dto.js';
import {
  portalAccessFromApi,
  supportRequestFromApi,
  supportThreadFromApi,
} from '@/shared/api/dtos/support.mapper.js';

const thread = (raw) =>
  supportThreadFromApi(parseDto(supportThreadDtoSchema, raw, 'support request'));

/** Customers' portal access and the support queue. REST only. */
export function createSupportRepository({ http = httpClient } = {}) {
  return {
    async portalAccess(customerId, { signal } = {}) {
      return portalAccessFromApi(
        parseDto(
          portalAccessDtoSchema,
          await http.get(`/admin/customers/${customerId}/portal-access`, { signal }),
          'portal access',
        ),
      );
    },
    async sendLink(customerId, { idempotencyKey } = {}) {
      return portalAccessFromApi(
        parseDto(
          portalAccessDtoSchema,
          await http.post(
            `/admin/customers/${customerId}/portal-access/send-link`,
            {},
            { idempotencyKey },
          ),
          'portal access',
        ),
      );
    },
    async setAccess(customerId, enabled, { idempotencyKey } = {}) {
      return portalAccessFromApi(
        parseDto(
          portalAccessDtoSchema,
          await http.post(
            `/admin/customers/${customerId}/portal-access/${enabled ? 'enable' : 'disable'}`,
            {},
            { idempotencyKey },
          ),
          'portal access',
        ),
      );
    },
    async list({ status, q, cursor, limit } = {}, { signal } = {}) {
      const page = parseDto(
        supportPageDtoSchema,
        await http.get('/admin/support-requests', { query: { status, q, cursor, limit }, signal }),
        'support page',
      );
      return {
        items: page.data.map(supportRequestFromApi),
        nextCursor: page.next_cursor,
        waiting: page.waiting,
      };
    },
    async get(id, { signal } = {}) {
      return thread(await http.get(`/admin/support-requests/${id}`, { signal }));
    },
    async reply(id, message, { idempotencyKey } = {}) {
      return thread(
        await http.post(`/admin/support-requests/${id}/messages`, { message }, { idempotencyKey }),
      );
    },
    async setStatus(id, action, { idempotencyKey } = {}) {
      return thread(
        await http.post(`/admin/support-requests/${id}/${action}`, {}, { idempotencyKey }),
      );
    },
  };
}

export const supportRepository = createSupportRepository();
