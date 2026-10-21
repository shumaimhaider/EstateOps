import { z } from 'zod';
import { minorToMajorInput, parseMajorToMinor } from '@/shared/lib/money.js';

export const minorToInput = minorToMajorInput;

const METHODS = ['cash', 'bank_transfer', 'online', 'cheque'];
const MIN_REASON = 3;

/**
 * Validates the take-payment form for one invoice. `mode` is 'manual' (mark received by hand)
 * or 'card'. With `adjust` on, the invoice amount is changed first, so the payable balance is
 * the new amount minus what is already paid.
 */
export function createPaymentFormSchema({ currency, invoice, mode, t }) {
  const paid = invoice?.paid.minor ?? 0;
  const base = z.object({
    invoiceId: z.string().min(1, t('collections:pay.errors.invoice')),
    amount: z.string(),
    adjust: z.boolean(),
    adjustedAmount: z.string(),
    adjustmentReason: z.string(),
  });
  const shape =
    mode === 'card'
      ? base.extend({
          cardNumber: z
            .string()
            .refine(
              (v) => /^\d{13,19}$/.test(v.replace(/\s/g, '')),
              t('collections:pay.errors.cardNumber'),
            ),
          cardExpiry: z
            .string()
            .regex(/^(0[1-9]|1[0-2])\s*\/\s*\d{2}$/, t('collections:pay.errors.cardExpiry')),
          cardCvc: z.string().regex(/^\d{3,4}$/, t('collections:pay.errors.cardCvc')),
        })
      : base.extend({
          method: z.enum(METHODS),
          reference: z.string().max(60, t('collections:pay.errors.reference')),
          receivedOn: z.string(),
        });

  return shape.superRefine((values, ctx) => {
    let payable = invoice?.balance.minor ?? 0;
    if (values.adjust) {
      const next = parseMajorToMinor(values.adjustedAmount, currency);
      if (next === null || next <= paid) {
        ctx.addIssue({
          code: 'custom',
          path: ['adjustedAmount'],
          message: t('collections:pay.errors.adjustedAmount'),
        });
      } else payable = next - paid;
      if (values.adjustmentReason.trim().length < MIN_REASON) {
        ctx.addIssue({
          code: 'custom',
          path: ['adjustmentReason'],
          message: t('collections:pay.errors.adjustmentReason'),
        });
      }
    }
    const minor = parseMajorToMinor(values.amount, currency);
    if (minor === null || minor <= 0 || minor > payable) {
      ctx.addIssue({
        code: 'custom',
        path: ['amount'],
        message: t('collections:pay.errors.amount'),
      });
    }
  });
}

/** Form values -> the payment the repository sends (no card details here). */
export function toPayment(values, currency) {
  const adjusted = values.adjust ? parseMajorToMinor(values.adjustedAmount, currency) : null;
  return {
    invoiceId: values.invoiceId,
    method: values.method ?? 'card',
    amountMinor: parseMajorToMinor(values.amount, currency),
    reference: values.reference?.trim() ?? '',
    receivedOn: values.receivedOn ?? '',
    adjustedAmountMinor: adjusted,
    adjustmentReason: values.adjust ? values.adjustmentReason.trim() : '',
  };
}

export const toCard = (values) => ({
  number: values.cardNumber.replace(/\s/g, ''),
  expiry: values.cardExpiry.replace(/\s/g, ''),
  cvc: values.cardCvc,
});
