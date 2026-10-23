import { describe, expect, it } from 'vitest';
import { fieldErrorsFromApi, paymentToApi } from './installment.mapper.js';

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

  it('maps server field errors to form fields', () => {
    expect(
      fieldErrorsFromApi({ adjusted_amount: 'a', adjustment_reason: 'b', received_on: 'c' }),
    ).toEqual({ adjustedAmount: 'a', adjustmentReason: 'b', receivedOn: 'c' });
  });
});
