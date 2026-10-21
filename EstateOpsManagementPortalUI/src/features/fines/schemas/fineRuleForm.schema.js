import { z } from 'zod';
import { minorToMajorInput, parseMajorToMinor } from '@/shared/lib/money.js';

/** Percent is typed as 0-100 with up to two decimals; fixed is an amount in the tenant currency. */
export function createFineRuleFormSchema({ currency, t }) {
  return z
    .object({
      kind: z.enum(['percent', 'fixed']),
      percent: z.string(),
      amount: z.string(),
    })
    .superRefine((values, ctx) => {
      if (values.kind === 'percent') {
        const n = Number(values.percent);
        const valid = /^\d+(\.\d{1,2})?$/.test(values.percent.trim()) && n >= 0 && n <= 100;
        if (!valid) {
          ctx.addIssue({
            code: 'custom',
            path: ['percent'],
            message: t('fines:form.errors.percent'),
          });
        }
      } else if (parseMajorToMinor(values.amount, currency) === null) {
        ctx.addIssue({ code: 'custom', path: ['amount'], message: t('fines:form.errors.amount') });
      }
    });
}

/** Form values for editing the current rule (or sensible blanks when there is none). */
export function initialFineValues(rule) {
  return {
    kind: rule?.kind ?? 'percent',
    percent: rule?.percent != null ? String(rule.percent) : '2',
    amount: rule?.amount ? minorToMajorInput(rule.amount.minor, rule.currency) : '',
  };
}

export function toRule(values, { scope, scopeId, unitKind = null, currency }) {
  const at = { scope, scopeId, unitKind };
  return values.kind === 'percent'
    ? { ...at, kind: 'percent', percent: Number(values.percent) }
    : { ...at, kind: 'fixed', amountMinor: parseMajorToMinor(values.amount, currency) };
}
