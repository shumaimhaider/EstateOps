import { z } from 'zod';
import { parseMajorToMinor } from '@/shared/lib/money.js';

/** Validates the record-payment form. `balanceMinor` is the selected invoice's outstanding amount. */
export function createPaymentFormSchema({ currency, balanceMinor, t }) {
  return z.object({
    invoiceId: z.string().min(1, t('collections:pay.errors.invoice')),
    amount: z.string().refine((v) => {
      const minor = parseMajorToMinor(v, currency);
      return minor !== null && minor > 0 && minor <= balanceMinor;
    }, t('collections:pay.errors.amount')),
    method: z.enum(['cash', 'bank_transfer', 'online', 'cheque']),
    reference: z.string().max(60, t('collections:pay.errors.reference')),
  });
}

export function toPayment(values, currency) {
  return {
    invoiceId: values.invoiceId,
    method: values.method,
    amountMinor: parseMajorToMinor(values.amount, currency),
    reference: values.reference.trim(),
  };
}

/** Plain-number string for an amount input (no grouping), e.g. 1250000.50 */
export function minorToInput(minor, currency) {
  const exp = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits;
  const s = String(minor).padStart(exp + 1, '0');
  const whole = s.slice(0, s.length - exp);
  const frac = s.slice(s.length - exp);
  return exp === 0 ? whole : `${whole}.${frac}`;
}
