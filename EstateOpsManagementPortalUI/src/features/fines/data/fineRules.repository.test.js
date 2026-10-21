import { describe, expect, it } from 'vitest';
import { getDb, mockToken, tokenStore } from '@/test/mockServer.js';
import { createFineRulesRepository } from './fineRules.repository.js';

const repo = createFineRulesRepository();

/** An overdue PK installment with its booking, unit and customer. */
function overdueCase() {
  const db = getDb();
  const pk = db.tenants[0].id;
  const row = db.installments.find((i) => i.tenant_id === pk && i.status === 'overdue');
  const booking = db.bookings.find((b) => b.id === row.booking_id);
  const unit = db.units.find((u) => u.id === booking.unit_id);
  return { db, row, booking, unit };
}

const fixed = (scope, scopeId, major) => ({
  scope,
  scopeId,
  kind: 'fixed',
  amountMinor: major * 100,
});
const percent = (scope, scopeId, value) => ({ scope, scopeId, kind: 'percent', percent: value });

describe('fine rates', () => {
  it('starts with a 2% default that every level inherits', async () => {
    const { unit } = overdueCase();
    const rules = await repo.list();
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ scope: 'default', kind: 'percent', percent: 2 });

    const effective = await repo.effective({ scope: 'unit', scopeId: unit.id });
    expect(effective).toMatchObject({ inherited: true, rule: { scope: 'default' } });
    expect(effective.allowedActions).toEqual(['set']);
  });

  it('prices overdue fines per property, per project and per customer, most specific first', async () => {
    const { db, row, booking, unit } = overdueCase();

    await repo.save(fixed('project', unit.project_id, 5000));
    expect(row.fine_amount).toBe(500_000);

    await repo.save(percent('unit', unit.id, 10));
    expect(row.fine_amount).toBe(Math.round(row.amount * 0.1));

    await repo.save(fixed('customer', booking.customer_id, 1234));
    expect(row.fine_amount).toBe(123_400);

    const effective = await repo.effective({ scope: 'unit', scopeId: unit.id });
    expect(effective).toMatchObject({ inherited: true, rule: { scope: 'customer' } });
    expect(
      (await repo.effective({ scope: 'customer', scopeId: booking.customer_id })).inherited,
    ).toBe(false);

    // removing overrides falls back one level at a time, all the way to the default
    const ids = Object.fromEntries((await repo.list()).map((r) => [r.scope, r.id]));
    await repo.remove(ids.customer);
    expect(row.fine_amount).toBe(Math.round(row.amount * 0.1));
    await repo.remove(ids.unit);
    await repo.remove(ids.project);
    expect(row.fine_amount).toBe(Math.round(row.amount * 0.02));
    expect(db.fineRules.filter((r) => r.tenant_id === row.tenant_id)).toHaveLength(1);
  });

  it('prices each unit category differently within a project', async () => {
    const { row, unit } = overdueCase();
    const other = ['plot', 'flat', 'villa', 'shop'].find((k) => k !== unit.kind);

    await repo.save({ ...fixed('project', unit.project_id, 2500), unitKind: other });
    expect(row.fine_amount).toBe(Math.round(row.amount * 0.02)); // other category: no effect

    await repo.save({ ...fixed('project', unit.project_id, 7500), unitKind: unit.kind });
    expect(row.fine_amount).toBe(750_000);

    // the project's category rate beats its all-category rate; both beat the default
    await repo.save(percent('project', unit.project_id, 9));
    expect(row.fine_amount).toBe(750_000);

    const mine = await repo.effective({
      scope: 'project',
      scopeId: unit.project_id,
      unitKind: unit.kind,
    });
    expect(mine).toMatchObject({ inherited: false, unitKind: unit.kind });
    expect(mine.allowedActions).toEqual(['set', 'clear']);
    const rest = await repo.effective({ scope: 'project', scopeId: unit.project_id });
    expect(rest).toMatchObject({ inherited: false, unitKind: null, rule: { percent: 9 } });

    // removing the category rate falls back to the project's all-category rate
    const categoryRule = (await repo.list()).find(
      (r) => r.scope === 'project' && r.unitKind === unit.kind,
    );
    await repo.remove(categoryRule.id);
    expect(row.fine_amount).toBe(Math.round(row.amount * 0.09));
  });

  it('lets a customer have a rate per category, ahead of their own all-category rate', async () => {
    const { row, booking, unit } = overdueCase();
    await repo.save(percent('customer', booking.customer_id, 5));
    expect(row.fine_amount).toBe(Math.round(row.amount * 0.05));
    await repo.save({ ...fixed('customer', booking.customer_id, 100), unitKind: unit.kind });
    expect(row.fine_amount).toBe(10_000);

    const effective = await repo.effective({ scope: 'unit', scopeId: unit.id });
    expect(effective.rule).toMatchObject({ scope: 'customer', unitKind: unit.kind });
  });

  it('lets the default differ by category, while the all-category default stays', async () => {
    const { row, unit } = overdueCase();
    await repo.save({ ...percent('default', null, 7), unitKind: unit.kind });
    expect(row.fine_amount).toBe(Math.round(row.amount * 0.07));

    const [all, byKind] = await repo.list();
    expect(all).toMatchObject({ scope: 'default', unitKind: null, percent: 2 });
    expect(byKind).toMatchObject({ scope: 'default', unitKind: unit.kind });
    expect(byKind.allowedActions).toEqual(['edit', 'delete']);
    expect(all.allowedActions).toEqual(['edit']);

    await repo.remove(byKind.id);
    expect(row.fine_amount).toBe(Math.round(row.amount * 0.02));
  });

  it('rejects a category on a single property and an unknown category', async () => {
    const { unit } = overdueCase();
    await expect(
      repo.save({ ...percent('unit', unit.id, 3), unitKind: 'shop' }),
    ).rejects.toMatchObject({ status: 422, fieldErrors: { unitKind: expect.any(String) } });
    await expect(
      repo.save({ ...percent('project', unit.project_id, 3), unitKind: 'castle' }),
    ).rejects.toMatchObject({ status: 422, fieldErrors: { unitKind: expect.any(String) } });
  });

  it('replaces the rate at a level instead of adding a second one', async () => {
    const { unit } = overdueCase();
    await repo.save(percent('project', unit.project_id, 3));
    await repo.save(percent('project', unit.project_id, 4));
    const projectRules = (await repo.list()).filter((r) => r.scope === 'project');
    expect(projectRules).toHaveLength(1);
    expect(projectRules[0].percent).toBe(4);
  });

  it('rejects bad rates with field errors, and never removes the default', async () => {
    const { unit } = overdueCase();
    await expect(repo.save(percent('project', unit.project_id, 101))).rejects.toMatchObject({
      status: 422,
      fieldErrors: { rate: expect.any(String) },
    });
    await expect(repo.save(percent('project', 'not-a-real-id', 5))).rejects.toMatchObject({
      status: 422,
    });
    const [def] = await repo.list();
    await expect(repo.remove(def.id)).rejects.toMatchObject({
      status: 409,
      code: 'DEFAULT_RULE_REQUIRED',
    });
  });

  it('lets roles without fines.view see nothing and roles without fines.manage see no actions', async () => {
    tokenStore.set(mockToken('pk', 'sales_agent'));
    await expect(repo.list()).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });

    tokenStore.set(mockToken('pk', 'auditor'));
    const { unit } = overdueCase();
    expect((await repo.effective({ scope: 'unit', scopeId: unit.id })).allowedActions).toEqual([]);
    await expect(repo.save(percent('project', unit.project_id, 5))).rejects.toMatchObject({
      status: 403,
    });
  });

  it('keeps tenants apart', async () => {
    const { db } = overdueCase();
    const ae = db.tenants[1];
    const aeUnit = db.units.find((u) => u.tenant_id === ae.id);
    await expect(repo.effective({ scope: 'unit', scopeId: aeUnit.id })).rejects.toMatchObject({
      status: 404,
    });
  });
});
