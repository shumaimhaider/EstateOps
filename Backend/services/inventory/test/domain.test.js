import { describe, expect, it } from 'vitest';
import { ValidationError } from '@estateops/kernel';
import { createProject, updateProject } from '../src/projects/domain/project.js';
import { createFileAsset, markReady } from '../src/files/domain/fileAsset.js';
import {
  createBlock,
  createFloor,
  createPhase,
  updateBlock,
} from '../src/structure/domain/structure.js';
import {
  applyStaffAction,
  bookUnit,
  createMedia,
  createUnit,
  releaseUnit,
  sellUnit,
  staffActions,
  unitMachine,
  updateUnit,
} from '../src/units/domain/unit.js';
import { MAP_HEIGHT, MAP_WIDTH, layoutProject } from '../src/layout/domain/layout.js';
import { UNIT_FIELDS } from './fakes.js';

const fields = (e) => {
  try {
    e();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return error.details.map((d) => d.field);
  }
  throw new Error('expected a validation error');
};
const unit = (over = {}) =>
  createUnit({
    tenantId: 't',
    projectId: 'p',
    fields: { ...UNIT_FIELDS, ...over },
    tenantCurrency: 'PKR',
  });

describe('project and structure', () => {
  it('creates and updates a project, trimming names', () => {
    const p = createProject({
      tenantId: 't',
      name: ' Gulberg Greens ',
      location: ' Lahore ',
      kind: 'plot_society',
    });
    expect(p).toMatchObject({ name: 'Gulberg Greens', location: 'Lahore', version: 1 });
    expect(updateProject(p, { kind: 'mixed' })).toMatchObject({
      kind: 'mixed',
      name: 'Gulberg Greens',
    });
    expect(fields(() => createProject({ tenantId: 't', name: ' ', kind: 'castle' }))).toEqual([
      'name',
      'kind',
    ]);
  });
  it('validates phases, blocks and floors', () => {
    expect(createPhase({ tenantId: 't', projectId: 'p', name: ' Phase 1 ' }).name).toBe('Phase 1');
    expect(fields(() => createPhase({ tenantId: 't', projectId: 'p', name: '' }))).toEqual([
      'name',
    ]);
    expect(
      createBlock({ tenantId: 't', projectId: 'p', name: 'Block A', kind: 'plot_block' }),
    ).toMatchObject({ phaseId: null, geometry: null });
    expect(
      fields(() => createBlock({ tenantId: 't', projectId: 'p', name: '', kind: 'x' })),
    ).toEqual(['name', 'kind']);
    expect(
      updateBlock(createBlock({ tenantId: 't', projectId: 'p', name: 'A', kind: 'plot_block' }), {
        name: 'B',
      }).name,
    ).toBe('B');
    expect(createFloor({ tenantId: 't', blockId: 'b', number: 3 }).label).toBe('Floor 3');
    expect(createFloor({ tenantId: 't', blockId: 'b', number: 0, label: 'Ground' }).label).toBe(
      'Ground',
    );
    expect(fields(() => createFloor({ tenantId: 't', blockId: 'b', number: -1 }))).toEqual([
      'number',
    ]);
  });
});

describe('unit', () => {
  it('starts available, unbooked, at version 1', () => {
    expect(unit()).toMatchObject({
      status: 'available',
      bookingId: null,
      everBooked: false,
      version: 1,
      unitNo: 'A-01',
      currency: 'PKR',
    });
  });
  it('reports every bad field with the names the API uses', () => {
    expect(
      fields(() =>
        unit({ unitNo: ' ', kind: 'castle', areaValue: 0, areaUnit: 'acre', listPrice: -1 }),
      ),
    ).toEqual(['unit_no', 'kind', 'area_value', 'area_unit', 'list_price']);
    expect(fields(() => unit({ bedrooms: 1.5 }))).toEqual(['bedrooms']);
    expect(fields(() => unit({ listPrice: 1.5 }))).toEqual(['list_price']);
  });
  it('insists the price is in the tenant currency', () => {
    expect(fields(() => unit({ currency: 'USD' }))).toEqual(['list_price']);
  });
  it('lets staff hold, release, block and unblock, nothing else', () => {
    const u = unit();
    expect(staffActions(u)).toEqual(['hold', 'block']);
    const held = applyStaffAction(u, 'hold');
    expect(held.status).toBe('held');
    expect(staffActions(held)).toEqual(['release']);
    expect(applyStaffAction(held, 'release').status).toBe('available');
    const blocked = applyStaffAction(u, 'block');
    expect(staffActions(blocked)).toEqual(['unblock']);
    expect(applyStaffAction(blocked, 'unblock').status).toBe('available');
  });
  it('refuses actions the state does not allow, including system-only ones', () => {
    expect(() => applyStaffAction(unit(), 'unblock')).toThrow(
      /Cannot unblock a unit that is available/,
    );
    expect(() => applyStaffAction(unit(), 'book')).toThrow(
      expect.objectContaining({ code: 'INVALID_TRANSITION' }),
    );
    const sold = sellUnit(bookUnit(unit(), 'b1'), 'b1');
    expect(staffActions(sold)).toEqual([]);
    expect(() => applyStaffAction(sold, 'block')).toThrow(
      expect.objectContaining({ code: 'INVALID_TRANSITION' }),
    );
  });
  it('follows the booking: booked, then sold or released', () => {
    const booked = bookUnit(unit(), 'b1');
    expect(booked).toMatchObject({ status: 'booked', bookingId: 'b1', everBooked: true });
    expect(sellUnit(booked, 'b1').status).toBe('sold');
    const released = releaseUnit(booked, 'b1');
    expect(released).toMatchObject({ status: 'available', bookingId: null, everBooked: true });
  });
  it('books from held but never from blocked, sold or already booked', () => {
    expect(bookUnit(applyStaffAction(unit(), 'hold'), 'b1').status).toBe('booked');
    expect(() => bookUnit(applyStaffAction(unit(), 'block'), 'b1')).toThrow(
      expect.objectContaining({ code: 'INVALID_TRANSITION' }),
    );
    expect(() => bookUnit(bookUnit(unit(), 'b1'), 'b2')).toThrow(
      expect.objectContaining({ code: 'INVALID_TRANSITION' }),
    );
  });
  it('ignores another booking trying to sell or release the unit', () => {
    const booked = bookUnit(unit(), 'b1');
    expect(() => sellUnit(booked, 'b2')).toThrow(/another booking/);
    expect(() => releaseUnit(booked, 'b2')).toThrow(/another booking/);
  });
  it('freezes booked and sold units but edits free ones', () => {
    const edited = updateUnit(
      unit(),
      { listPrice: 20_000_000_00, unitNo: ' A-02 ', facing: null },
      'PKR',
    );
    expect(edited).toMatchObject({
      listPrice: 20_000_000_00,
      unitNo: 'A-02',
      facing: null,
      kind: 'plot',
    });
    expect(() => updateUnit(bookUnit(unit(), 'b1'), { listPrice: 1 }, 'PKR')).toThrow(
      expect.objectContaining({ code: 'UNIT_LOCKED' }),
    );
    expect(fields(() => updateUnit(unit(), { areaValue: -1 }, 'PKR'))).toEqual(['area_value']);
  });
  it('machine has the documented shape', () => {
    expect(unitMachine.states).toEqual(['available', 'held', 'booked', 'sold', 'blocked']);
  });
});

describe('unit pictures', () => {
  const flat = unit({ kind: 'flat', unitNo: 'T-101' });
  it('allows pictures on flats, shops and villas but never plots', () => {
    expect(
      createMedia({
        tenantId: 't',
        unit: flat,
        kind: 'image',
        fileId: 'f-1',
        caption: 'Living room',
      }),
    ).toMatchObject({ unitId: flat.id, kind: 'image' });
    expect(() =>
      createMedia({ tenantId: 't', unit: unit(), kind: 'image', fileId: 'f-1' }),
    ).toThrow(expect.objectContaining({ code: 'NO_MEDIA_ON_PLOTS' }));
  });
  it('checks kind and file', () => {
    expect(fields(() => createMedia({ tenantId: 't', unit: flat, kind: 'video' }))).toEqual([
      'kind',
      'file',
    ]);
  });
});

describe('site plan layout', () => {
  const inside = (g, b) =>
    g.x >= b.x && g.y >= b.y && g.x + g.w <= b.x + b.w && g.y + g.h <= b.y + b.h;
  it('places every block on the canvas and every unit inside its block', () => {
    const blocks = ['A', 'B', 'C', 'D'].map((id) => ({ id }));
    const unitsByBlock = new Map(
      blocks.map((b) => [
        b.id,
        Array.from({ length: 12 }, (_, i) => ({ id: `${b.id}${i}`, floorId: null })),
      ]),
    );
    const out = layoutProject(blocks, unitsByBlock, new Map());
    expect(out.blocks).toHaveLength(4);
    expect(out.units).toHaveLength(48);
    for (const { geometry: g } of out.blocks)
      expect(g.x + g.w).toBeLessThanOrEqual(MAP_WIDTH) &&
        expect(g.y + g.h).toBeLessThanOrEqual(MAP_HEIGHT);
    for (const b of blocks) {
      const g = out.blocks.find((x) => x.blockId === b.id).geometry;
      for (const u of unitsByBlock.get(b.id))
        expect(inside(out.units.find((x) => x.unitId === u.id).geometry, g)).toBe(true);
    }
  });
  it('stacks a tower by floor: higher floors sit higher', () => {
    const floors = new Map([
      ['f1', { number: 1 }],
      ['f2', { number: 2 }],
      ['f3', { number: 3 }],
    ]);
    const units = [
      { id: 'u1', floorId: 'f1' },
      { id: 'u2', floorId: 'f1' },
      { id: 'u3', floorId: 'f3' },
      { id: 'u4', floorId: 'f3' },
      { id: 'u5', floorId: 'f2' },
      { id: 'u6', floorId: 'f2' },
    ];
    const out = layoutProject([{ id: 'T' }], new Map([['T', units]]), floors);
    const y = (id) => out.units.find((u) => u.unitId === id).geometry.y;
    expect(y('u3')).toBeLessThan(y('u5'));
    expect(y('u5')).toBeLessThan(y('u1'));
    expect(out.units.find((u) => u.unitId === 'u1').geometry.x).not.toBe(
      out.units.find((u) => u.unitId === 'u2').geometry.x,
    );
  });
  it('copes with no blocks, and with a block without units', () => {
    expect(layoutProject([], new Map(), new Map())).toEqual({ blocks: [], units: [] });
    expect(layoutProject([{ id: 'E' }], new Map(), new Map()).units).toEqual([]);
  });
});

describe('file assets', () => {
  const base = {
    tenantId: 't',
    ownerType: 'unit',
    ownerId: 'u',
    purpose: 'unit_image',
    storedName: 'a.jpg',
    originalName: '  A.JPG ',
    contentType: 'image/jpeg',
    size: 10,
  };
  it('starts pending and becomes ready only when storage matches', () => {
    const a = createFileAsset(base);
    expect(a).toMatchObject({ status: 'pending', originalName: 'A.JPG' });
    expect(markReady(a, { size: 10, contentType: 'image/jpeg' }).status).toBe('ready');
    expect(() => markReady(a, null)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(() => markReady(a, { size: 11, contentType: 'image/jpeg' })).toThrow();
    expect(() => markReady(a, { size: 10, contentType: 'image/png' })).toThrow();
    expect(() =>
      markReady({ ...a, status: 'ready' }, { size: 10, contentType: 'image/jpeg' }),
    ).toThrow(expect.objectContaining({ code: 'UPLOAD_ALREADY_USED' }));
  });
  it('checks purpose and name', () => {
    expect(
      fields(() => createFileAsset({ ...base, purpose: 'x', originalName: ' ', contentType: '' })),
    ).toEqual(['purpose', 'filename', 'content_type']);
  });
});
