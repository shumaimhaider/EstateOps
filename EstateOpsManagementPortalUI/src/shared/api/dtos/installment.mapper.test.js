import { describe, expect, it } from 'vitest';
import {
  cardPaymentToApi,
  fieldErrorsFromApi,
  paymentIntentToApi,
  paymentToApi,
} from './installment.mapper.js';

describe('payment mappers', () => {
  it('sends the adjustment only when the invoice amount is being changed', () => {
    expect(paymentToApi({ method: 'cash', amountMinor: 100, reference: '' })).toEqual({
      method: 'cash',
      amount: 100,
      reference: undefined,
      received_on: undefined,
      note: undefined,
    });
    expect(
      paymentToApi({
        method: 'bank_transfer',
        receivedOn: '2026-10-01',
        adjustedAmountMinor: 900,
        adjustmentReason: 'Discount',
      }),
    ).toMatchObject({
      received_on: '2026-10-01',
      adjusted_amount: 900,
      adjustment_reason: 'Discount',
    });
  });

  it('starts a card payment with the amount and adjustment, and records it by intent id', () => {
    expect(paymentIntentToApi({ amountMinor: 50 })).toEqual({ amount: 50 });
    expect(paymentIntentToApi({ adjustedAmountMinor: 90, adjustmentReason: 'x' })).toMatchObject({
      adjusted_amount: 90,
    });
    expect(cardPaymentToApi('pi_1')).toEqual({ payment_intent_id: 'pi_1' });
  });

  it('maps server field errors to form fields', () => {
    expect(
      fieldErrorsFromApi({ adjusted_amount: 'a', adjustment_reason: 'b', received_on: 'c' }),
    ).toEqual({ adjustedAmount: 'a', adjustmentReason: 'b', receivedOn: 'c' });
  });
});
