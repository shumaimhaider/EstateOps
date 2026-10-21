import { z } from 'zod';
import { parseDto } from '@/shared/api/contract.js';
import { effectiveFineRuleDtoSchema, fineRuleDtoSchema } from '@/shared/api/dtos/fineRule.dto.js';
import {
  effectiveFromApi,
  effectiveParamsToApi,
  fieldErrorsFromApi,
  fromApi,
  toApi,
} from '@/shared/api/dtos/fineRule.mapper.js';
import { pageDtoSchema } from '@/shared/api/dtos/page.dto.js';
import { fineRulesRest } from './transport/fineRules.rest.js';

const pageSchema = pageDtoSchema(fineRuleDtoSchema);
const mapFieldErrors = (error) => {
  if (error?.fieldErrors) error.fieldErrors = fieldErrorsFromApi(error.fieldErrors);
  return error;
};

/** Late-fine rates (REST only): the rate at each level and the rate that applies after inheritance. */
export function createFineRulesRepository({ transport = fineRulesRest } = {}) {
  return {
    async list({ signal } = {}) {
      const page = parseDto(pageSchema, await transport.list({ signal }), 'fine rule page');
      return page.items.map(fromApi);
    },
    async effective(target, { signal } = {}) {
      const raw = await transport.effective(effectiveParamsToApi(target), { signal });
      return effectiveFromApi(parseDto(effectiveFineRuleDtoSchema, raw, 'effective fine rule'));
    },
    async save(rule, { idempotencyKey } = {}) {
      try {
        const raw = await transport.save(toApi(rule), { idempotencyKey });
        return fromApi(parseDto(fineRuleDtoSchema, raw, 'fine rule'));
      } catch (error) {
        throw mapFieldErrors(error);
      }
    },
    async remove(id, { idempotencyKey } = {}) {
      parseDto(z.object({ ok: z.boolean() }), await transport.remove(id, { idempotencyKey }), 'ok');
    },
  };
}

export const fineRulesRepository = createFineRulesRepository();
