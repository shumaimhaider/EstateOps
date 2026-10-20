import { describe, expect, it } from 'vitest';
import { unitDtoSchema, unitWriteDtoSchema } from './unit.dto.js';
import { fieldErrorsFromApi, filtersToApi, fromApi, toApi } from './unit.mapper.js';

const SAMPLE = {
  id: '3f0e6f1a-2b0c-4d59-8a41-0d6b1c2f9a10',
  tenant_id: '6b8f4c2e-9a1d-4f33-9e0a-1f6c2d7b8a55',
  project_id: 'a1d3f6c8-5e2b-4c7a-8b90-3d4e5f6a7b8c',
  project_name: 'Gulberg Greens',
  phase_id: null,
  block_id: null,
  block_name: 'Block A',
  floor_id: null,
  floor_label: null,
  unit_no: 'A-01',
  kind: 'plot',
  area_value: 10,
  area_unit: 'marla',
  bedrooms: null,
  facing: 'North',
  view: null,
  corner: true,
  parking: 1,
  attributes: {},
  status: 'available',
  list_price: 2800000000,
  currency: 'PKR',
  geometry: null,
  allowed_actions: ['hold', 'block'],
  booking_id: null,
  created_at: '2026-05-01T08:00:00.000Z',
  updated_at: '2026-05-01T08:00:00.000Z',
  created_by: null,
};

describe('unit mapper', () => {
  it('maps a wire DTO to a camelCase model with money in minor units', () => {
    const unit = fromApi(unitDtoSchema.parse(SAMPLE));
    expect(unit).toMatchObject({
      unitNo: 'A-01',
      projectName: 'Gulberg Greens',
      isCorner: true,
      area: { value: 10, unit: 'marla' },
      listPrice: { minor: 2800000000, currency: 'PKR' },
      allowedActions: ['hold', 'block'],
      statusHistory: [],
    });
    expect(Object.keys(unit).some((k) => k.includes('_'))).toBe(false);
  });

  it('round-trips writable fields: toApi(model) matches the original DTO values', () => {
    const model = fromApi(unitDtoSchema.parse(SAMPLE));
    const body = toApi({ ...model, parkingSpaces: model.parkingSpaces });
    expect(unitWriteDtoSchema.parse(body)).toEqual({
      project_id: SAMPLE.project_id,
      unit_no: SAMPLE.unit_no,
      kind: SAMPLE.kind,
      area_value: SAMPLE.area_value,
      area_unit: SAMPLE.area_unit,
      bedrooms: SAMPLE.bedrooms,
      facing: SAMPLE.facing,
      view: SAMPLE.view,
      corner: SAMPLE.corner,
      parking: SAMPLE.parking,
      list_price: SAMPLE.list_price,
      currency: SAMPLE.currency,
    });
  });

  it('turns model filters into wire params and server field errors into form fields', () => {
    expect(
      filtersToApi({
        search: 'A-0',
        status: 'held',
        projectId: 'p1',
        sort: { field: 'listPrice', dir: 'desc' },
      }),
    ).toEqual({
      q: 'A-0',
      status: 'held',
      kind: undefined,
      project_id: 'p1',
      sort: 'list_price:desc',
    });
    expect(fieldErrorsFromApi({ unit_no: 'taken', list_price: 'bad' })).toEqual({
      unitNo: 'taken',
      listPrice: 'bad',
    });
  });

  it('rejects malformed responses', () => {
    expect(unitDtoSchema.safeParse({ ...SAMPLE, status: 'teleported' }).success).toBe(false);
    expect(unitDtoSchema.safeParse({ ...SAMPLE, list_price: 12.5 }).success).toBe(false);
    expect(unitDtoSchema.safeParse({ ...SAMPLE, unit_no: undefined }).success).toBe(false);
  });
});
