import { parseDto } from '@/shared/api/contract.js';
import { httpClient } from '@/shared/api/httpClient.js';
import {
  invoiceDtoSchema,
  listDtoSchema,
  propertyDtoSchema,
} from '@/shared/api/dtos/property.dto.js';
import { invoiceFromApi, propertyFromApi } from '@/shared/api/dtos/property.mapper.js';

/** The customer's own properties and their payment schedules (read-only). */
export function createPropertiesRepository({ http = httpClient } = {}) {
  return {
    async list({ signal } = {}) {
      const page = parseDto(
        listDtoSchema(propertyDtoSchema),
        await http.get('/portal/properties', { signal }),
        'properties',
      );
      return page.data.map(propertyFromApi);
    },
    async get(id, { signal } = {}) {
      return propertyFromApi(
        parseDto(
          propertyDtoSchema,
          await http.get(`/portal/properties/${id}`, { signal }),
          'property',
        ),
      );
    },
    async invoices(id, { signal } = {}) {
      const page = parseDto(
        listDtoSchema(invoiceDtoSchema),
        await http.get(`/portal/properties/${id}/invoices`, { signal }),
        'invoices',
      );
      return page.data.map(invoiceFromApi);
    },
  };
}

export const propertiesRepository = createPropertiesRepository();
