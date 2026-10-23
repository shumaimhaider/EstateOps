import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENT, buildEvent } from '@estateops/contracts';
import { TEST_TENANT_A } from '@estateops/platform/testing';
import { CreateSchedule } from '../src/installments/application/CreateSchedule.js';
import { RecordPayment } from '../src/installments/application/RecordPayment.js';
import { CONFIRMED, actor, buildBillingTest } from './fakes.js';

describe('collection stats served from the cache', () => {
  let t;
  let finance;
  const stats = (h) => request(t.app).get('/api/v1/admin/stats/collections').set(h);
  const summaries = () => t.events.filter((e) => e.type === 'booking.summary_changed');

  beforeEach(async () => {
    t = await buildBillingTest({ withCache: true });
    finance = await t.auth.bearer({ role: 'finance' });
    await new CreateSchedule(t.deps).execute(
      buildEvent({
        type: EVENT.BOOKING_CONFIRMED,
        tenantId: TEST_TENANT_A,
        producer: 'x',
        data: CONFIRMED({ booked_at: '2026-05-01' }),
        now: t.clock.now(),
      }),
    );
  });

  it('computes the figures once and serves repeats from the cache', async () => {
    const spy = vi.spyOn(t.repos.stats, 'collect');
    const a = await stats(finance);
    const b = await stats(finance);
    expect(a.status).toBe(200);
    expect(b.body).toEqual(a.body);
    expect(spy).toHaveBeenCalledTimes(1);
    await request(t.app)
      .get('/api/v1/admin/stats/collections?project_id=00000000-0000-4000-8000-000000000201')
      .set(finance);
    expect(spy).toHaveBeenCalledTimes(2); // another project is another entry
  });

  it('refreshes when billing announces that a booking’s money changed, on any replica', async () => {
    const spy = vi.spyOn(t.repos.stats, 'collect');
    await stats(finance);
    await new RecordPayment(t.deps).execute({
      actor: actor('finance'),
      id: [...t.stores.invoices.keys()][0],
      input: { method: 'cash' },
    });
    await stats(finance);
    expect(spy).toHaveBeenCalledTimes(1); // nothing has told the cache yet: still within its few seconds
    const changed = summaries().at(-1);
    await t.app.handlers[EVENT.BOOKING_SUMMARY_CHANGED](changed);
    await stats(finance);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('expires by time as well, and tomorrow’s figures are a new entry', async () => {
    const spy = vi.spyOn(t.repos.stats, 'collect');
    await stats(finance);
    t.clock.advance(31_000);
    await stats(finance);
    expect(spy).toHaveBeenCalledTimes(2);
    t.clock.advanceDays(1);
    await stats(finance);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('keeps working when Redis is down, and still refuses those without the permission', async () => {
    t.cacheClient.failing = true;
    expect((await stats(finance)).status).toBe(200);
    expect((await stats(finance)).status).toBe(200);
    const none = await t.auth.bearer({ role: 'marketing' });
    expect((await stats(none)).status).toBe(403);
  });
});
