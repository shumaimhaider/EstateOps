import { beforeEach, describe, expect, it } from 'vitest';
import { EVENT, buildEvent } from '@estateops/contracts';
import { ValidationError } from '@estateops/kernel';
import { TEST_TENANT_A, TEST_TENANT_B, eventsOfType } from '@estateops/platform/testing';
import { createCustomer, maskIdNumber, updateCustomer } from '../src/customers/domain/customer.js';
import { CreateCustomer } from '../src/customers/application/CreateCustomer.js';
import { UpdateCustomer } from '../src/customers/application/UpdateCustomer.js';
import { DeleteCustomer } from '../src/customers/application/DeleteCustomer.js';
import { ListCustomers } from '../src/customers/application/ListCustomers.js';
import { GetCustomer } from '../src/customers/application/GetCustomer.js';
import { ApplyBookingSummary } from '../src/customers/application/ApplyBookingSummary.js';
import { ApplyBookingCancelled } from '../src/customers/application/ApplyBookingCancelled.js';
import { ApplyTenant } from '../src/tenants/application/ApplyTenant.js';
import { CUSTOMER, actor, buildCustomerTest } from './fakes.js';

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const fieldsOf = (fn) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ValidationError);
    return e.details.map((d) => d.field);
  }
  throw new Error('expected a validation error');
};

describe('customer domain', () => {
  const base = { tenantId: 't', ...CUSTOMER };
  it('normalises and starts with an empty money position', () => {
    const c = createCustomer(base);
    expect(c).toMatchObject({
      fullName: 'Ali Raza',
      email: 'ali@example.test',
      bookingsCount: 0,
      totalValue: 0,
      unitsSummary: [],
      version: 1,
    });
    expect(createCustomer({ tenantId: 't', fullName: 'Min' })).toMatchObject({
      phone: null,
      email: null,
      idNumber: null,
      preferredLanguage: 'en',
    });
    expect(createCustomer({ ...base, phone: '', email: '' })).toMatchObject({
      phone: null,
      email: null,
    });
  });
  it('reports every bad field with the API names', () => {
    expect(
      fieldsOf(() =>
        createCustomer({
          tenantId: 't',
          fullName: ' ',
          phone: 'abc',
          email: 'nope',
          idNumber: '!',
          city: 'x'.repeat(81),
          preferredLanguage: 'fr',
        }),
      ),
    ).toEqual(['full_name', 'phone', 'email', 'id_number', 'city', 'preferred_language']);
  });
  it('updates only what was sent, and can clear optional fields', () => {
    const c = createCustomer(base);
    expect(updateCustomer(c, { city: 'Karachi' })).toMatchObject({
      city: 'Karachi',
      fullName: 'Ali Raza',
      email: 'ali@example.test',
    });
    expect(updateCustomer(c, { phone: null, email: '' })).toMatchObject({
      phone: null,
      email: null,
    });
    expect(fieldsOf(() => updateCustomer(c, { email: 'bad' }))).toEqual(['email']);
  });
  it('masks every digit of an ID number except the last', () => {
    expect(maskIdNumber('35202-1234567-1')).toBe('*****-*******-1');
    expect(maskIdNumber('784-1990-1234567-1')).toBe('***-****-*******-1');
    expect(maskIdNumber(null)).toBe('');
  });
});

describe('customer use cases', () => {
  let t;
  let owner;
  beforeEach(async () => {
    t = await buildCustomerTest();
    owner = actor('owner');
  });
  const create = (over = {}, a = owner) =>
    new CreateCustomer(t.deps).execute({ actor: a, ...CUSTOMER, ...over });

  it('creates a customer, audits it without the ID number, and announces it', async () => {
    const c = await create();
    expect(c.tenantId).toBe(TEST_TENANT_A);
    expect(JSON.stringify(t.auditEntries)).not.toContain('35202');
    expect(eventsOfType(t.events, 'customer.upserted')[0].data).toEqual({
      customer_id: c.id,
      full_name: 'Ali Raza',
      phone: '+92 300 1234567',
      email: 'ali@example.test',
    });
  });
  it('refuses a duplicate email in a tenant, ignoring case, but allows it in another', async () => {
    await create();
    await expect(create({ email: 'ALI@example.test' })).rejects.toMatchObject({
      code: 'EMAIL_TAKEN',
    });
    await expect(create({}, actor('owner', { tenantId: TEST_TENANT_B }))).resolves.toBeTruthy();
    await expect(create({ email: null, fullName: 'No Email' })).resolves.toBeTruthy();
    await expect(create({ email: null, fullName: 'No Email 2' })).resolves.toBeTruthy();
  });
  it('updates, re-announces, and refuses an email another customer has', async () => {
    const a = await create();
    const b = await create({ email: 'b@example.test', fullName: 'Bilal' });
    const saved = await new UpdateCustomer(t.deps).execute({
      actor: owner,
      id: a.id,
      patch: { city: 'Karachi' },
    });
    expect(saved).toMatchObject({ city: 'Karachi', version: 2 });
    expect(eventsOfType(t.events, 'customer.upserted')).toHaveLength(3);
    await expect(
      new UpdateCustomer(t.deps).execute({
        actor: owner,
        id: b.id,
        patch: { email: 'ali@example.test' },
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
    await expect(
      new UpdateCustomer(t.deps).execute({ actor: owner, id: uuid(404), patch: {} }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('lists with search, overdue filter, sort and paging, always scoped to the tenant', async () => {
    const a = await create({ fullName: 'Ali', email: 'a@x.test' });
    const b = await create({ fullName: 'Bilal', email: 'b@x.test', phone: '+971 50 1112222' });
    await create({ fullName: 'Chand', email: 'c@x.test' });
    await create(
      { fullName: 'Stranger', email: 's@x.test' },
      actor('owner', { tenantId: TEST_TENANT_B }),
    );
    t.stores.customers.get(b.id).overdueAmount = 500;
    t.stores.customers.get(a.id).unitsSummary = ['A-01'];
    t.stores.customers.get(a.id).totalValue = 900;
    const list = (f) => new ListCustomers(t.deps).execute({ actor: owner, ...f });
    expect((await list({})).items.map((i) => i.customer.fullName)).toEqual([
      'Ali',
      'Bilal',
      'Chand',
    ]);
    expect((await list({ hasOverdue: true })).items.map((i) => i.customer.fullName)).toEqual([
      'Bilal',
    ]);
    expect((await list({ q: '+971' })).items).toHaveLength(1);
    expect((await list({ q: 'a-01' })).items.map((i) => i.customer.fullName)).toEqual(['Ali']);
    expect((await list({ sort: 'total_value:desc' })).items[0].customer.fullName).toBe('Ali');
    await expect(list({ sort: 'password:asc' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    const first = await list({ limit: 2 });
    expect((await list({ limit: 2, cursor: first.nextCursor })).items).toHaveLength(1);
    expect(first.items[0].currency).toBe('PKR');
  });
  it('gives allowed actions by role and by whether bookings exist', async () => {
    const c = await create();
    const actions = async (a) =>
      (await new GetCustomer(t.deps).execute({ actor: a, id: c.id })).allowedActions;
    expect(await actions(owner)).toEqual(['update', 'delete']);
    expect(await actions(actor('sales_agent'))).toEqual(['update', 'delete']);
    expect(await actions(actor('support'))).toEqual([]);
    t.stores.customers.get(c.id).bookingsCount = 1;
    expect(await actions(owner)).toEqual(['update']);
  });
  it('deletes only a customer without bookings', async () => {
    const free = await create();
    const used = await create({ email: 'u@x.test', fullName: 'Used' });
    await new ApplyBookingSummary(t.deps).execute(summary(used.id, uuid(1), 1));
    await expect(
      new DeleteCustomer(t.deps).execute({ actor: owner, id: used.id }),
    ).rejects.toMatchObject({ code: 'CUSTOMER_HAS_BOOKINGS' });
    await new DeleteCustomer(t.deps).execute({ actor: owner, id: free.id });
    await expect(
      new GetCustomer(t.deps).execute({ actor: owner, id: free.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('needs the right permission and hides other tenants', async () => {
    const c = await create();
    const support = actor('support');
    for (const run of [
      () => create({ email: 'z@x.test' }, support),
      () => new UpdateCustomer(t.deps).execute({ actor: support, id: c.id, patch: {} }),
      () => new DeleteCustomer(t.deps).execute({ actor: support, id: c.id }),
    ])
      await expect(run()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const dealer = actor('dealer_manager');
    await expect(new ListCustomers(t.deps).execute({ actor: dealer })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      new GetCustomer(t.deps).execute({ actor: dealer, id: c.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const stranger = actor('owner', { tenantId: TEST_TENANT_B });
    await expect(
      new GetCustomer(t.deps).execute({ actor: stranger, id: c.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      new DeleteCustomer(t.deps).execute({ actor: stranger, id: c.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  const summary = (customerId, bookingId, seq, over = {}) =>
    buildEvent({
      type: EVENT.BOOKING_SUMMARY_CHANGED,
      tenantId: TEST_TENANT_A,
      producer: 'billing',
      data: {
        booking_id: bookingId,
        customer_id: customerId,
        seq,
        unit_no: 'A-01',
        total_price: 1000,
        currency: 'PKR',
        installments_total: 13,
        installments_paid: 1,
        installments_due: 0,
        installments_overdue: 0,
        installments_upcoming: 12,
        received_amount: 200,
        pending_amount: 800,
        overdue_amount: 0,
        fine_amount: 0,
        next_due_date: '2026-11-21',
        escalated: false,
        ...over,
      },
    });

  describe('money position from booking events', () => {
    it('sums the customer’s bookings and updates as payments arrive', async () => {
      const c = await create();
      await new ApplyBookingSummary(t.deps).execute(
        summary(c.id, uuid(1), 1, {
          unit_no: 'A-01',
          total_price: 1000,
          received_amount: 200,
          pending_amount: 800,
        }),
      );
      await new ApplyBookingSummary(t.deps).execute(
        summary(c.id, uuid(2), 1, {
          unit_no: 'B-02',
          total_price: 500,
          received_amount: 100,
          pending_amount: 400,
          overdue_amount: 50,
          escalated: true,
        }),
      );
      expect(t.stores.customers.get(c.id)).toMatchObject({
        bookingsCount: 2,
        totalValue: 1500,
        receivedAmount: 300,
        pendingAmount: 1200,
        overdueAmount: 50,
        escalatedCount: 1,
        unitsSummary: ['A-01', 'B-02'],
      });
      await new ApplyBookingSummary(t.deps).execute(
        summary(c.id, uuid(1), 2, { received_amount: 700, pending_amount: 300 }),
      );
      expect(t.stores.customers.get(c.id)).toMatchObject({
        receivedAmount: 800,
        pendingAmount: 700,
      });
    });
    it('ignores an older summary arriving late, and a repeated event', async () => {
      const c = await create();
      await new ApplyBookingSummary(t.deps).execute(
        summary(c.id, uuid(1), 5, { received_amount: 900, pending_amount: 100 }),
      );
      await new ApplyBookingSummary(t.deps).execute(
        summary(c.id, uuid(1), 3, { received_amount: 100, pending_amount: 900 }),
      );
      expect(t.stores.customers.get(c.id).receivedAmount).toBe(900);
      const event = summary(c.id, uuid(1), 6, { received_amount: 950, pending_amount: 50 });
      await new ApplyBookingSummary(t.deps).execute(event);
      expect((await new ApplyBookingSummary(t.deps).execute(event)).duplicate).toBe(true);
    });
    it('drops a cancelled booking from the totals and never revives it', async () => {
      const c = await create();
      await new ApplyBookingSummary(t.deps).execute(summary(c.id, uuid(1), 1));
      await new ApplyBookingSummary(t.deps).execute(summary(c.id, uuid(2), 1, { unit_no: 'B-02' }));
      await new ApplyBookingCancelled(t.deps).execute(
        buildEvent({
          type: EVENT.BOOKING_CANCELLED,
          tenantId: TEST_TENANT_A,
          producer: 'sales',
          data: { booking_id: uuid(1), unit_id: uuid(7), customer_id: c.id },
        }),
      );
      expect(t.stores.customers.get(c.id)).toMatchObject({
        bookingsCount: 1,
        unitsSummary: ['B-02'],
        totalValue: 1000,
      });
      await new ApplyBookingSummary(t.deps).execute(summary(c.id, uuid(1), 9));
      expect(t.stores.customers.get(c.id).bookingsCount).toBe(1);
    });
    it('quietly ignores a summary for a customer that does not exist', async () => {
      const result = await new ApplyBookingSummary(t.deps).execute(summary(uuid(404), uuid(1), 1));
      expect(result.duplicate).toBe(false);
      expect(t.stores.summaries.size).toBe(0);
    });
  });

  it('keeps the newest tenant currency when events arrive out of order', async () => {
    const event = (currency, at) => ({
      ...buildEvent({
        type: EVENT.TENANT_UPSERTED,
        tenantId: TEST_TENANT_B,
        producer: 'identity',
        data: {
          slug: 'ae',
          name: 'x',
          currency,
          locale: 'en',
          time_zone: 'UTC',
          area_unit: 'sq_ft',
        },
      }),
      occurred_at: at,
    });
    await new ApplyTenant(t.deps).execute(event('AED', '2026-10-21T10:00:00.000Z'));
    await new ApplyTenant(t.deps).execute(event('USD', '2026-10-21T08:00:00.000Z'));
    expect((await t.repos.tenantRefs.get(TEST_TENANT_B)).currency).toBe('AED');
  });
});
