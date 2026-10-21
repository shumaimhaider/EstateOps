import { parseDto } from '@/shared/api/contract.js';
import { contractDtoSchema } from '@/shared/api/dtos/contract.dto.js';
import {
  fieldErrorsFromApi,
  fromApi,
  pandaDocToApi,
  reviseToApi,
  uploadToApi,
} from '@/shared/api/dtos/contract.mapper.js';
import { pageDtoSchema } from '@/shared/api/dtos/page.dto.js';
import { contractsRest } from './transport/contracts.rest.js';

const pageSchema = pageDtoSchema(contractDtoSchema);
const one = (raw) => fromApi(parseDto(contractDtoSchema, raw, 'contract'));

async function withFieldErrors(run) {
  try {
    return await run();
  } catch (error) {
    if (error?.fieldErrors) error.fieldErrors = fieldErrorsFromApi(error.fieldErrors);
    throw error;
  }
}

/** Sale contracts of a booking (REST only): signed uploads and PandaDoc documents. */
export function createContractsRepository({ transport = contractsRest } = {}) {
  return {
    async list(bookingId, { signal } = {}) {
      const page = parseDto(
        pageSchema,
        await transport.list(bookingId, { signal }),
        'contract page',
      );
      return page.items.map(fromApi);
    },
    uploadSigned: (bookingId, upload, opts) =>
      withFieldErrors(async () =>
        one(await transport.uploadSigned(bookingId, uploadToApi(upload), opts)),
      ),
    createPandaDoc: (bookingId, input, opts) =>
      withFieldErrors(async () =>
        one(await transport.createPandaDoc(bookingId, pandaDocToApi(input), opts)),
      ),
    send: async (id, opts) => one(await transport.act(id, 'send', undefined, opts)),
    void: async (id, opts) => one(await transport.act(id, 'void', undefined, opts)),
    revise: (id, input, opts) =>
      withFieldErrors(async () => one(await transport.act(id, 'revise', reviseToApi(input), opts))),
    simulateEvent: async (id, event, opts) => one(await transport.simulate(id, event, opts)),
  };
}

export const contractsRepository = createContractsRepository();
