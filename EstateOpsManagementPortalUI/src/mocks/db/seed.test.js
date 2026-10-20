import { describe, expect, it } from 'vitest';
import { buildSeed } from './seed.js';

describe('seed', () => {
  it('is deterministic for the fixed seed', () => {
    const a = buildSeed(1);
    const b = buildSeed(1);
    expect(a.units.map((u) => [u.id, u.unit_no, u.status, u.list_price])).toEqual(
      b.units.map((u) => [u.id, u.unit_no, u.status, u.list_price]),
    );
  });

  it('seeds two tenants with projects, a spread of statuses, integer minor-unit prices', () => {
    const db = buildSeed(1);
    expect(db.tenants.map((t) => t.currency)).toEqual(['PKR', 'AED']);
    expect(db.projects).toHaveLength(6);
    expect(db.units.length).toBeGreaterThan(600);
    expect(new Set(db.units.map((u) => u.status))).toEqual(
      new Set(['available', 'held', 'booked', 'sold', 'blocked']),
    );
    expect(db.units.every((u) => Number.isInteger(u.list_price) && u.list_price > 0)).toBe(true);
    const keys = db.units.map((u) => `${u.project_id}:${u.unit_no}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
