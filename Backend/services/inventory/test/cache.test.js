import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENT, buildEvent } from '@estateops/contracts';
import { TEST_TENANT_A, TEST_TENANT_B } from '@estateops/platform/testing';
import { buildInventoryTest } from './fakes.js';

const BASE = '/api/v1/admin';
const UNIT = {
  unit_no: 'A-01',
  kind: 'flat',
  area_value: 5,
  area_unit: 'marla',
  list_price: 100000000,
  currency: 'PKR',
  bedrooms: 2,
};

describe('inventory reads served from the cache', () => {
  let t;
  let owner;
  let project;
  const call = (method, path, body, h = owner) =>
    request(t.app)[method](`${BASE}${path}`).set(h).send(body);

  beforeEach(async () => {
    t = await buildInventoryTest({ withCache: true });
    owner = await t.auth.bearer({ role: 'owner' });
    project = (
      await call('post', '/projects', { name: 'Gulberg', location: 'Lahore', kind: 'plot_society' })
    ).body;
  });

  it('reads the project list from the database once, then from the cache', async () => {
    const spy = vi.spyOn(t.repos.projects, 'list');
    const first = await call('get', '/projects');
    const second = await call('get', '/projects');
    expect(second.body).toEqual(first.body);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(first.body.data[0]).toMatchObject({
      name: 'Gulberg',
      allowed_actions: ['update', 'delete'],
    });
  });

  it('shows each role its own actions and each tenant its own projects', async () => {
    await call('get', '/projects');
    const agent = await t.auth.bearer({ role: 'sales_agent' });
    expect((await call('get', '/projects', undefined, agent)).body.data[0].allowed_actions).toEqual(
      [],
    );
    const other = await t.auth.bearer({ role: 'owner', tenantId: TEST_TENANT_B });
    expect((await call('get', '/projects', undefined, other)).body.data).toEqual([]);
  });

  it('refreshes at once after a change made through the API', async () => {
    expect((await call('get', '/projects')).body.data[0].units_total).toBe(0);
    await call('post', '/units', { ...UNIT, project_id: project.id });
    expect((await call('get', '/projects')).body.data[0].units_total).toBe(1);
    await call('patch', `/projects/${project.id}`, { name: 'Gulberg Greens' });
    expect((await call('get', '/projects')).body.data[0].name).toBe('Gulberg Greens');
  });

  it('serves the site map from the cache and drops it when a unit’s status changes', async () => {
    const phase = (await call('post', `/projects/${project.id}/phases`, { name: 'Phase 1' })).body;
    const block = (
      await call('post', `/projects/${project.id}/blocks`, {
        phase_id: phase.id,
        name: 'Block A',
        kind: 'plot_block',
      })
    ).body;
    const unit = (
      await call('post', '/units', {
        ...UNIT,
        kind: 'plot',
        project_id: project.id,
        phase_id: phase.id,
        block_id: block.id,
      })
    ).body;
    await call('post', `/projects/${project.id}/layout`, {});
    const spy = vi.spyOn(t.repos.units, 'listShapes');
    const a = await call('get', `/projects/${project.id}/map`);
    await call('get', `/projects/${project.id}/map`);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(a.body.shapes[0]).toMatchObject({ unit_id: unit.id, status: 'available' });
    await call('post', `/units/${unit.id}/block`, {});
    expect((await call('get', `/projects/${project.id}/map`)).body.shapes[0].status).toBe(
      'blocked',
    );
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('drops the cached lists when another service’s booking changes a unit (the unit.upserted event)', async () => {
    const spy = vi.spyOn(t.repos.projects, 'list');
    await call('get', '/projects');
    const event = buildEvent({
      type: EVENT.UNIT_UPSERTED,
      tenantId: TEST_TENANT_A,
      producer: 'inventory',
      data: {
        unit_id: '00000000-0000-4000-8000-000000000001',
        project_id: project.id,
        project_name: 'Gulberg',
        unit_no: 'A-01',
        kind: 'flat',
        status: 'sold',
        list_price: 1,
        currency: 'PKR',
      },
    });
    await t.app.handlers[EVENT.UNIT_UPSERTED](event);
    await call('get', '/projects');
    expect(spy).toHaveBeenCalledTimes(2);
    await t.app.handlers[EVENT.PROJECT_UPSERTED]({ ...event, type: EVENT.PROJECT_UPSERTED });
  });

  it('keeps answering from the database when Redis is down', async () => {
    t.cacheClient.failing = true;
    const spy = vi.spyOn(t.repos.projects, 'list');
    expect((await call('get', '/projects')).status).toBe(200);
    expect((await call('get', '/projects')).status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('never caches a missing project or a refused request', async () => {
    expect((await call('get', '/projects/00000000-0000-4000-8000-000000000999/map')).status).toBe(
      404,
    );
    const noView = await t.auth.bearer({ role: 'dealer_manager' });
    expect((await call('get', '/projects', undefined, noView)).status).toBe(403);
    expect((await call('get', '/projects', undefined, noView)).status).toBe(403);
  });
});
