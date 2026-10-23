import { parseDto } from '@/shared/api/contract.js';
import { attemptsPageDtoSchema, runsPageDtoSchema } from '@/shared/api/dtos/collectionRun.dto.js';
import {
  attemptFromApi,
  attemptsFiltersToApi,
  runFromApi,
} from '@/shared/api/dtos/collectionRun.mapper.js';
import { collectionRunsRest } from './transport/collectionRuns.rest.js';

/** The automatic collection's history: one entry per day, and one row per invoice for a day. */
export function createCollectionRunsRepository({ transport = collectionRunsRest } = {}) {
  return {
    async listDays({ before, limit = 31 } = {}, { signal } = {}) {
      const page = parseDto(
        runsPageDtoSchema,
        await transport.listDays({ before: before || undefined, limit }, { signal }),
        'collection runs',
      );
      return { items: page.data.map(runFromApi), nextBefore: page.next_before };
    },
    async listAttempts(date, filters = {}, { signal } = {}) {
      const page = parseDto(
        attemptsPageDtoSchema,
        await transport.listAttempts(date, attemptsFiltersToApi(filters), { signal }),
        'collection attempts',
      );
      return {
        items: page.data.map(attemptFromApi),
        nextAfter: page.next_after,
        summary: page.summary ? runFromApi(page.summary) : null,
      };
    },
  };
}

export const collectionRunsRepository = createCollectionRunsRepository();
