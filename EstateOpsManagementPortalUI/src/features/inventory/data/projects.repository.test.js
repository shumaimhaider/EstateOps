import { describe, expect, it } from 'vitest';
import { getDb } from '@/test/mockServer.js';
import { createProjectsRepository } from './projects.repository.js';
import { createUnitsRepository } from './units.repository.js';
import { projectsGraphql } from './transport/projects.graphql.js';
import { projectsRest } from './transport/projects.rest.js';
import { unitsGraphql } from './transport/units.graphql.js';
import { unitsRest } from './transport/units.rest.js';

const projects = (transport) =>
  createProjectsRepository({
    transports: { rest: projectsRest, graphql: projectsGraphql },
    pickTransport: () => transport,
  });
const units = (transport) =>
  createUnitsRepository({
    transports: { rest: unitsRest, graphql: unitsGraphql },
    pickTransport: () => transport,
  });

describe.each(['rest', 'graphql'])('projects and pictures over %s', (transport) => {
  it('returns projects with live unit counts that add up', async () => {
    const { items } = await projects(transport).list();
    expect(items).toHaveLength(3);
    for (const p of items) {
      const counts = Object.values(p.unitCounts).reduce((t, n) => t + n, 0);
      expect(counts).toBe(p.unitsTotal);
    }
  });

  it('returns a site map with one shape per unit, coloured by live status', async () => {
    const [project] = (await projects(transport).list()).items;
    const map = await projects(transport).map(project.id);
    expect(map.shapes).toHaveLength(project.unitsTotal);
    expect(map.blocks.length).toBeGreaterThan(0);
    const db = getDb();
    for (const shape of map.shapes.slice(0, 20)) {
      expect(shape.status).toBe(db.units.find((u) => u.id === shape.unitId).status);
      expect(shape.x).toBeGreaterThanOrEqual(0);
      expect(shape.x + shape.w).toBeLessThanOrEqual(map.width);
      expect(shape.y + shape.h).toBeLessThanOrEqual(map.height);
    }
  });

  it('gives flats, shops and villas pictures but never plots', async () => {
    const repo = units(transport);
    for (const [kind, expected] of [
      ['flat', true],
      ['shop', true],
      ['villa', true],
      ['plot', false],
    ]) {
      const [row] = (await repo.list({ kind }, { limit: 1 })).items;
      const detail = await repo.get(row.id);
      expect(detail.media.length > 0).toBe(expected);
      for (const image of detail.media) expect(image.url).toMatch(/^data:image\/svg\+xml/);
    }
  });

  it('links a sold unit to its booking', async () => {
    const [sold] = (await units(transport).list({ status: 'sold' }, { limit: 1 })).items;
    expect(sold.bookingId).toEqual(expect.any(String));
  });
});
