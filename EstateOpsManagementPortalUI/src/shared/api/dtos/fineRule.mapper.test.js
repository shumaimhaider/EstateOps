import { describe, expect, it } from 'vitest';
import { fineRuleDtoSchema } from './fineRule.dto.js';
import { fieldErrorsFromApi, fromApi, toApi } from './fineRule.mapper.js';

const dto = (over) => ({
  id: '3f0c7b9e-5b77-4d1a-9a55-0e8a6f1f2a10',
  tenant_id: '8a1f2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b',
  scope: 'project',
  scope_id: '1b2c3d4e-5f60-4a71-8b92-a3b4c5d6e7f8',
  scope_name: 'Gulberg Greens',
  unit_kind: 'shop',
  kind: 'percent',
  value: 250,
  currency: 'PKR',
  allowed_actions: ['edit', 'delete'],
  updated_at: '2026-10-21T09:00:00.000Z',
  updated_by_name: 'Sam',
  ...over,
});

describe('fine rule mapper', () => {
  it('turns basis points into a percentage and minor units into money', () => {
    expect(fromApi(fineRuleDtoSchema.parse(dto()))).toMatchObject({
      kind: 'percent',
      percent: 2.5,
      amount: null,
      scopeName: 'Gulberg Greens',
      unitKind: 'shop',
    });
    expect(fromApi(fineRuleDtoSchema.parse(dto({ kind: 'fixed', value: 500_000 })))).toMatchObject({
      percent: null,
      amount: { minor: 500_000, currency: 'PKR' },
    });
  });

  it('sends a percentage as whole basis points, never a float', () => {
    expect(toApi({ scope: 'default', scopeId: null, kind: 'percent', percent: 1.15 })).toEqual({
      scope: 'default',
      scope_id: null,
      unit_kind: null,
      kind: 'percent',
      value: 115,
    });
    expect(toApi({ scope: 'unit', scopeId: 'u1', kind: 'fixed', amountMinor: 500_000 }).value).toBe(
      500_000,
    );
    expect(
      toApi({ scope: 'project', scopeId: 'p1', unitKind: 'shop', kind: 'percent', percent: 3 }),
    ).toMatchObject({ unit_kind: 'shop', value: 300 });
  });

  it('names the rate field the way the form does', () => {
    expect(fieldErrorsFromApi({ value: 'bad', scope_id: 'worse' })).toEqual({
      rate: 'bad',
      scopeId: 'worse',
    });
  });
});
