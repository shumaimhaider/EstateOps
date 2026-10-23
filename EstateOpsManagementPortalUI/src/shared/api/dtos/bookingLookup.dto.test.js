import { describe, expect, it } from 'vitest';
import {
  bookingRequestToApi,
  customerChoiceFromApi,
  planChoiceDtoSchema,
  planChoiceFromApi,
  unitChoiceDtoSchema,
  unitChoiceFromApi,
} from './bookingLookup.dto.js';

const id = '00000000-0000-4000-8000-000000000001';

describe('new-booking choices', () => {
  it('turns a unit, customer and plan into what the form shows, keeping money as minor units', () => {
    const unit = unitChoiceFromApi(
      unitChoiceDtoSchema.parse({
        id,
        unit_no: 'A-01',
        kind: 'plot',
        project_name: 'Gulberg',
        list_price: 120000000,
        currency: 'PKR',
        status: 'available',
      }),
    );
    expect(unit).toMatchObject({ unitNo: 'A-01', price: { minor: 120000000, currency: 'PKR' } });
    expect(customerChoiceFromApi({ id, full_name: 'Ali Raza', email: null })).toEqual({
      id,
      name: 'Ali Raza',
      email: '',
      phone: '',
    });
    expect(
      planChoiceFromApi(
        planChoiceDtoSchema.parse({ id, name: '20% + 12', down_pct: 20, installment_count: 12 }),
      ),
    ).toEqual({ id, name: '20% + 12', downPct: 20, installments: 12 });
  });

  it('builds the create request, leaving the date out when blank so the server uses today', () => {
    expect(
      bookingRequestToApi({ unitId: 'u', customerId: 'c', planId: 'p', bookedAt: '' }),
    ).toEqual({ unit_id: 'u', customer_id: 'c', plan_id: 'p' });
    expect(
      bookingRequestToApi({ unitId: 'u', customerId: 'c', planId: 'p', bookedAt: '2026-10-01' })
        .booked_at,
    ).toBe('2026-10-01');
  });
});
