import { beforeEach, describe, expect, it } from 'vitest';
import { EVENT, buildEvent } from '@estateops/contracts';
import { ValidationError } from '@estateops/kernel';
import { TEST_TENANT_A, TEST_TENANT_B, eventsOfType } from '@estateops/platform/testing';
import { createPlan, updatePlan } from '../src/plans/domain/plan.js';
import {
  applySummary,
  bookingMachine,
  canCancel,
  cancelByStaff,
  createBooking,
  transitionTo,
} from '../src/bookings/domain/booking.js';
import { CreatePlan } from '../src/plans/application/CreatePlan.js';
import { UpdatePlan } from '../src/plans/application/UpdatePlan.js';
import { DeletePlan } from '../src/plans/application/DeletePlan.js';
import { ListPlans } from '../src/plans/application/ListPlans.js';
import { GetPlan } from '../src/plans/application/GetPlan.js';
import { CreateBooking } from '../src/bookings/application/CreateBooking.js';
import { CancelBooking } from '../src/bookings/application/CancelBooking.js';
import { ListBookings } from '../src/bookings/application/ListBookings.js';
import { GetBooking } from '../src/bookings/application/GetBooking.js';
import { FollowSaga } from '../src/bookings/application/FollowSaga.js';
import { ApplyUnit } from '../src/refs/application/ApplyUnit.js';
import { ApplyCustomer } from '../src/refs/application/ApplyCustomer.js';
import { CUSTOMER_REF, UNIT_REF, actor, buildSalesTest, uuid } from './fakes.js';

const fields = (fn) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ValidationError);
    return e.details.map((d) => d.field);
  }
  throw new Error('expected a validation error');
};

describe('payment plan domain', () => {
  it('creates and edits a plan, checking every field', () => {
    expect(
      createPlan({ tenantId: 't', name: ' 20% + 12 ', downPct: 20, installmentCount: 12 }),
    ).toMatchObject({ name: '20% + 12', version: 1 });
    expect(
      createPlan({ tenantId: 't', name: 'No down', downPct: 0, installmentCount: 1 }).downPct,
    ).toBe(0);
    expect(
      fields(() => createPlan({ tenantId: 't', name: '', downPct: 101, installmentCount: 0 })),
    ).toEqual(['name', 'down_pct', 'installment_count']);
    expect(fields(() => createPlan({ tenantId: 't', name: 'x' }))).toEqual([
      'down_pct',
      'installment_count',
    ]);
    expect(
      fields(() => createPlan({ tenantId: 't', name: 'x', downPct: 10.5, installmentCount: 121 })),
    ).toEqual(['down_pct', 'installment_count']);
    const plan = createPlan({ tenantId: 't', name: 'A', downPct: 20, installmentCount: 12 });
    expect(updatePlan(plan, { installmentCount: 24 })).toMatchObject({
      installmentCount: 24,
      downPct: 20,
    });
  });
});

describe('booking domain', () => {
  const plan = { id: uuid(401), name: '20% + 12', downPct: 20, installmentCount: 12 };
  const make = (over = {}) =>
    createBooking({
      tenantId: 't',
      unit: { ...UNIT_REF, ...over.unit },
      customer: CUSTOMER_REF,
      plan,
      bookedAt: over.bookedAt ?? '2026-10-21',
      today: '2026-10-21',
      createdBy: 'u',
    });

  it('starts requested with snapshots of price, plan and names and an empty money summary', () => {
    expect(make()).toMatchObject({
      status: 'requested',
      totalPrice: 1_000_000_00,
      currency: 'PKR',
      planName: '20% + 12',
      downPct: 20,
      installmentCount: 12,
      unitNo: 'A-01',
      unitKind: 'plot',
      projectName: 'Gulberg Greens',
      buyerName: 'Ali Raza',
      receivedAmount: 0,
      installmentsTotal: 0,
      escalated: false,
      summarySeq: 0,
      version: 1,
    });
  });
  it('sells units that are available or held, and nothing else', () => {
    expect(make({ unit: { status: 'held' } }).status).toBe('requested');
    for (const status of ['booked', 'sold', 'blocked'])
      expect(() => make({ unit: { status } })).toThrow(
        expect.objectContaining({ code: 'UNIT_NOT_AVAILABLE', message: `The unit is ${status}` }),
      );
    expect(() => make({ unit: { listPrice: 0 } })).toThrow(
      expect.objectContaining({ code: 'UNIT_NOT_PRICED' }),
    );
  });
  it('accepts today or an earlier booking date, never a future or invalid one', () => {
    expect(make({ bookedAt: '2026-01-05' }).bookedAt).toBe('2026-01-05');
    expect(fields(() => make({ bookedAt: '2026-10-22' }))).toEqual(['booked_at']);
    expect(fields(() => make({ bookedAt: 'yesterday' }))).toEqual(['booked_at']);
  });
  it('follows requested -> confirmed -> active -> completed, with cancel for staff before completion', () => {
    let b = make();
    b = transitionTo(b, 'confirm');
    b = transitionTo(b, 'activate');
    expect(b.status).toBe('active');
    expect(transitionTo(b, 'complete').status).toBe('completed');
    expect(() => transitionTo(transitionTo(b, 'complete'), 'cancel')).toThrow(
      expect.objectContaining({ code: 'INVALID_TRANSITION' }),
    );
    expect(bookingMachine.staffActions('active')).toEqual(['cancel']);
    expect(bookingMachine.staffActions('completed')).toEqual([]);
    expect(() => transitionTo(make(), 'activate')).toThrow(
      /Cannot activate a booking that is requested/,
    );
  });
  it('lets staff cancel only while no money has been received', () => {
    const b = make();
    expect(canCancel(b)).toBe(true);
    expect(cancelByStaff(b, 'Customer changed mind')).toMatchObject({
      status: 'cancelled',
      cancelReason: 'Customer changed mind',
    });
    expect(canCancel({ ...b, receivedAmount: 1 })).toBe(false);
    expect(() => cancelByStaff({ ...b, receivedAmount: 1 })).toThrow(
      expect.objectContaining({ code: 'BOOKING_HAS_PAYMENTS' }),
    );
    expect(() => cancelByStaff({ ...b, status: 'completed' })).toThrow(
      expect.objectContaining({ code: 'INVALID_TRANSITION' }),
    );
  });
  it('applies a money summary only if it is newer than the one held', () => {
    const b = make();
    const summary = (seq, received) => ({
      seq,
      installments_total: 13,
      installments_paid: 1,
      installments_due: 0,
      installments_overdue: 2,
      installments_upcoming: 10,
      received_amount: received,
      pending_amount: 100,
      overdue_amount: 50,
      fine_amount: 5,
      next_due_date: '2026-11-21',
      escalated: true,
    });
    const first = applySummary(b, summary(2, 300));
    expect(first).toMatchObject({
      receivedAmount: 300,
      installmentsOverdue: 2,
      nextDueDate: '2026-11-21',
      escalated: true,
      summarySeq: 2,
    });
    expect(applySummary(first, summary(1, 999))).toBe(first);
    expect(applySummary(first, summary(2, 999))).toBe(first);
    expect(applySummary(first, summary(3, 400)).receivedAmount).toBe(400);
  });
});

describe('sales use cases', () => {
  let t;
  let sales;
  beforeEach(async () => {
    t = await buildSalesTest();
    sales = actor('sales_manager');
  });
  const book = (over = {}, a = sales) =>
    new CreateBooking(t.deps).execute({
      actor: a,
      unitId: UNIT_REF.unitId,
      customerId: CUSTOMER_REF.customerId,
      planId: t.plan.id,
      ...over,
    });
  const event = (type, data, tenantId = TEST_TENANT_A) =>
    buildEvent({ type, tenantId, producer: 'x', data });
  const saga = (step, e) => new FollowSaga({ ...t.deps, step }).execute(e);

  describe('payment plans', () => {
    it('creates, lists, reads, edits and deletes a plan', async () => {
      const plan = await new CreatePlan(t.deps).execute({
        actor: sales,
        name: '25% down + 24 monthly',
        downPct: 25,
        installmentCount: 24,
      });
      const list = await new ListPlans(t.deps).execute({ actor: sales });
      expect(list.items.map((i) => i.plan.name)).toEqual([
        '20% down + 12 monthly',
        '25% down + 24 monthly',
      ]);
      expect(list.items[0].allowedActions).toEqual(['update', 'delete']);
      expect((await new GetPlan(t.deps).execute({ actor: sales, id: plan.id })).plan.downPct).toBe(
        25,
      );
      expect(
        (
          await new UpdatePlan(t.deps).execute({
            actor: sales,
            id: plan.id,
            patch: { installmentCount: 36 },
          })
        ).installmentCount,
      ).toBe(36);
      await new DeletePlan(t.deps).execute({ actor: sales, id: plan.id });
      await expect(
        new GetPlan(t.deps).execute({ actor: sales, id: plan.id }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
    it('refuses a duplicate name, and deleting a plan a booking was sold under', async () => {
      await expect(
        new CreatePlan(t.deps).execute({
          actor: sales,
          name: '20% DOWN + 12 monthly',
          downPct: 20,
          installmentCount: 12,
        }),
      ).rejects.toMatchObject({ code: 'PLAN_NAME_TAKEN' });
      const other = await new CreatePlan(t.deps).execute({
        actor: sales,
        name: 'Other',
        downPct: 10,
        installmentCount: 6,
      });
      await expect(
        new UpdatePlan(t.deps).execute({
          actor: sales,
          id: other.id,
          patch: { name: '20% down + 12 monthly' },
        }),
      ).rejects.toMatchObject({ code: 'PLAN_NAME_TAKEN' });
      await book();
      await expect(
        new DeletePlan(t.deps).execute({ actor: sales, id: t.plan.id }),
      ).rejects.toMatchObject({ code: 'PLAN_IN_USE' });
    });
    it('shows no actions to a role that cannot manage, and refuses its writes', async () => {
      const support = actor('support');
      expect(
        (await new ListPlans(t.deps).execute({ actor: support })).items[0].allowedActions,
      ).toEqual([]);
      await expect(
        new CreatePlan(t.deps).execute({
          actor: support,
          name: 'x',
          downPct: 1,
          installmentCount: 1,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        new DeletePlan(t.deps).execute({ actor: support, id: t.plan.id }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        new ListPlans(t.deps).execute({ actor: actor('marketing') }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
    it('keeps plans of other tenants out of reach', async () => {
      const stranger = actor('owner', { tenantId: TEST_TENANT_B });
      expect((await new ListPlans(t.deps).execute({ actor: stranger })).items).toEqual([]);
      await expect(
        new UpdatePlan(t.deps).execute({ actor: stranger, id: t.plan.id, patch: {} }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('creating a booking', () => {
    it('creates a requested booking with snapshots, asks inventory to reserve, audits it', async () => {
      const b = await book();
      expect(b).toMatchObject({
        status: 'requested',
        unitNo: 'A-01',
        buyerName: 'Ali Raza',
        totalPrice: 1_000_000_00,
        bookedAt: '2026-10-21',
        createdBy: sales.userId,
      });
      expect(eventsOfType(t.events, 'booking.requested')[0].data).toEqual({
        booking_id: b.id,
        unit_id: UNIT_REF.unitId,
        customer_id: CUSTOMER_REF.customerId,
      });
      expect(t.auditEntries.at(-1)).toMatchObject({
        action: 'booking.create',
        after: { unitNo: 'A-01', totalPrice: 1_000_000_00 },
      });
    });
    it('freezes the sale: later changes to the unit price or plan do not touch it', async () => {
      const b = await book();
      await new ApplyUnit(t.deps).execute(
        event(EVENT.UNIT_UPSERTED, {
          unit_id: UNIT_REF.unitId,
          project_id: UNIT_REF.projectId,
          project_name: 'Gulberg Greens',
          unit_no: 'A-01',
          kind: 'plot',
          status: 'booked',
          list_price: 9_999,
          currency: 'PKR',
        }),
      );
      await new UpdatePlan(t.deps).execute({
        actor: sales,
        id: t.plan.id,
        patch: { installmentCount: 60 },
      });
      const kept = (await new GetBooking(t.deps).execute({ actor: sales, id: b.id })).booking;
      expect(kept).toMatchObject({ totalPrice: 1_000_000_00, installmentCount: 12 });
    });
    it('refuses a second booking on a unit that is already sold', async () => {
      await book();
      await expect(book()).rejects.toMatchObject({ code: 'UNIT_ALREADY_BOOKED' });
    });
    it('refuses unknown unit, customer or plan, and a unit that is not for sale', async () => {
      await expect(book({ unitId: uuid(999) })).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(book({ customerId: uuid(999) })).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(book({ planId: uuid(999) })).rejects.toMatchObject({ code: 'NOT_FOUND' });
      t.stores.unitRefs.get(UNIT_REF.unitId).status = 'blocked';
      await expect(book()).rejects.toMatchObject({ code: 'UNIT_NOT_AVAILABLE' });
      t.stores.unitRefs.get(UNIT_REF.unitId).status = 'available';
      await expect(book({ unitId: undefined })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(book({ bookedAt: '2030-01-01' })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    });
    it('does not see another tenant’s unit, customer or plan', async () => {
      await expect(
        book({}, actor('sales_manager', { tenantId: TEST_TENANT_B })),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
    it('needs sales.manage', async () => {
      await expect(book({}, actor('support'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(book({}, actor('finance'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('the saga, event by event', () => {
    it('confirms on unit.booked and announces booking.confirmed with the snapshots billing needs', async () => {
      const b = await book();
      await saga('confirmed', event(EVENT.UNIT_BOOKED, { booking_id: b.id, unit_id: b.unitId }));
      expect(t.stores.bookings.get(b.id).status).toBe('confirmed');
      expect(eventsOfType(t.events, 'booking.confirmed')[0].data).toEqual({
        booking_id: b.id,
        unit: {
          id: UNIT_REF.unitId,
          unit_no: 'A-01',
          kind: 'plot',
          project_id: UNIT_REF.projectId,
          project_name: 'Gulberg Greens',
        },
        customer: {
          id: CUSTOMER_REF.customerId,
          full_name: 'Ali Raza',
          phone: '+92 300 1234567',
          email: 'ali@example.test',
        },
        plan: { name: '20% down + 12 monthly', down_pct: 20, installment_count: 12 },
        total_price: 1_000_000_00,
        currency: 'PKR',
        booked_at: '2026-10-21',
      });
    });
    it('cancels with the reason when inventory rejects, and says nothing else', async () => {
      const b = await book();
      const events = t.events.length;
      await saga(
        'rejected',
        event(EVENT.UNIT_BOOKING_REJECTED, {
          booking_id: b.id,
          unit_id: b.unitId,
          reason: 'The unit is sold',
        }),
      );
      expect(t.stores.bookings.get(b.id)).toMatchObject({
        status: 'cancelled',
        cancelReason: 'The unit is sold',
      });
      expect(t.events).toHaveLength(events);
    });
    it('activates when billing created the schedule, and completes when fully paid', async () => {
      const b = await book();
      await saga('confirmed', event(EVENT.UNIT_BOOKED, { booking_id: b.id, unit_id: b.unitId }));
      await saga('scheduled', event(EVENT.SCHEDULE_CREATED, { booking_id: b.id, invoices: 13 }));
      expect(t.stores.bookings.get(b.id).status).toBe('active');
      await saga('paid', event(EVENT.BOOKING_FULLY_PAID, { booking_id: b.id }));
      expect(t.stores.bookings.get(b.id).status).toBe('completed');
      expect(eventsOfType(t.events, 'booking.completed')[0].data).toEqual({
        booking_id: b.id,
        unit_id: b.unitId,
      });
    });
    it('ignores events that do not fit the state, for unknown bookings, and for repeats', async () => {
      const b = await book();
      await saga('paid', event(EVENT.BOOKING_FULLY_PAID, { booking_id: b.id })); // still requested
      await saga('scheduled', event(EVENT.SCHEDULE_CREATED, { booking_id: b.id, invoices: 13 }));
      expect(t.stores.bookings.get(b.id).status).toBe('requested');
      await saga(
        'confirmed',
        event(EVENT.UNIT_BOOKED, { booking_id: uuid(404), unit_id: b.unitId }),
      );
      const e = event(EVENT.UNIT_BOOKED, { booking_id: b.id, unit_id: b.unitId });
      await saga('confirmed', e);
      const events = t.events.length;
      expect((await saga('confirmed', e)).duplicate).toBe(true);
      expect(t.events).toHaveLength(events);
    });
    it('does not let another tenant’s event move a booking', async () => {
      const b = await book();
      await saga(
        'confirmed',
        event(EVENT.UNIT_BOOKED, { booking_id: b.id, unit_id: b.unitId }, TEST_TENANT_B),
      );
      expect(t.stores.bookings.get(b.id).status).toBe('requested');
    });
    it('frees the unit again if the booking was cancelled while inventory was still reserving it', async () => {
      const b = await book();
      await new CancelBooking(t.deps).execute({ actor: sales, id: b.id });
      const before = eventsOfType(t.events, 'booking.cancelled').length;
      await saga('confirmed', event(EVENT.UNIT_BOOKED, { booking_id: b.id, unit_id: b.unitId }));
      expect(t.stores.bookings.get(b.id).status).toBe('cancelled');
      expect(eventsOfType(t.events, 'booking.cancelled')).toHaveLength(before + 1);
      expect(eventsOfType(t.events, 'booking.confirmed')).toHaveLength(0);
    });
    it('keeps money figures from billing, ignoring older summaries', async () => {
      const b = await book();
      const summary = (seq, received) =>
        event(EVENT.BOOKING_SUMMARY_CHANGED, {
          booking_id: b.id,
          customer_id: b.customerId,
          seq,
          unit_no: 'A-01',
          total_price: b.totalPrice,
          currency: 'PKR',
          installments_total: 13,
          installments_paid: 2,
          installments_due: 0,
          installments_overdue: 1,
          installments_upcoming: 10,
          received_amount: received,
          pending_amount: 100,
          overdue_amount: 20,
          fine_amount: 2,
          next_due_date: '2026-11-21',
          escalated: false,
        });
      await saga('summary', summary(4, 500));
      await saga('summary', summary(2, 1));
      expect(t.stores.bookings.get(b.id)).toMatchObject({
        receivedAmount: 500,
        installmentsTotal: 13,
        installmentsOverdue: 1,
        nextDueDate: '2026-11-21',
        summarySeq: 4,
      });
    });
  });

  describe('cancelling', () => {
    it('cancels with a reason, tells the other services, and audits it', async () => {
      const b = await book();
      const saved = await new CancelBooking(t.deps).execute({
        actor: sales,
        id: b.id,
        reason: ' Customer withdrew ',
      });
      expect(saved).toMatchObject({ status: 'cancelled', cancelReason: 'Customer withdrew' });
      expect(eventsOfType(t.events, 'booking.cancelled')[0].data).toEqual({
        booking_id: b.id,
        unit_id: b.unitId,
        customer_id: b.customerId,
      });
      expect(t.auditEntries.at(-1)).toMatchObject({
        action: 'booking.cancel',
        before: { status: 'requested' },
        after: { status: 'cancelled' },
      });
    });
    it('is allowed while active with no money, refused with money or once final', async () => {
      const b = await book();
      await saga('confirmed', event(EVENT.UNIT_BOOKED, { booking_id: b.id, unit_id: b.unitId }));
      await saga('scheduled', event(EVENT.SCHEDULE_CREATED, { booking_id: b.id, invoices: 13 }));
      t.stores.bookings.get(b.id).receivedAmount = 100;
      await expect(
        new CancelBooking(t.deps).execute({ actor: sales, id: b.id }),
      ).rejects.toMatchObject({ code: 'BOOKING_HAS_PAYMENTS' });
      t.stores.bookings.get(b.id).receivedAmount = 0;
      await new CancelBooking(t.deps).execute({ actor: sales, id: b.id });
      await expect(
        new CancelBooking(t.deps).execute({ actor: sales, id: b.id }),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    });
    it('needs sales.manage and hides other tenants’ bookings', async () => {
      const b = await book();
      await expect(
        new CancelBooking(t.deps).execute({ actor: actor('support'), id: b.id }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        new CancelBooking(t.deps).execute({
          actor: actor('owner', { tenantId: TEST_TENANT_B }),
          id: b.id,
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('reading bookings', () => {
    it('lists with filters, sort and paging and shows cancel only to those who may', async () => {
      const b = await book();
      t.stores.unitRefs.set(uuid(102), {
        ...UNIT_REF,
        unitId: uuid(102),
        unitNo: 'B-02',
        kind: 'shop',
      });
      const second = await book({ unitId: uuid(102) });
      Object.assign(t.stores.bookings.get(second.id), {
        status: 'active',
        receivedAmount: 50,
        escalated: true,
      });
      const list = (f, a = sales) => new ListBookings(t.deps).execute({ actor: a, ...f });
      expect((await list({})).items).toHaveLength(2);
      expect((await list({ status: 'active' })).items.map((i) => i.booking.id)).toEqual([
        second.id,
      ]);
      expect((await list({ kind: 'shop' })).items).toHaveLength(1);
      expect((await list({ escalated: true })).items).toHaveLength(1);
      expect((await list({ q: 'ali' })).items).toHaveLength(2);
      expect((await list({ customerId: b.customerId, unitId: b.unitId })).items).toHaveLength(1);
      expect((await list({ sort: 'unit_no:asc' })).items.map((i) => i.booking.unitNo)).toEqual([
        'A-01',
        'B-02',
      ]);
      await expect(list({ sort: 'buyer_phone:asc' })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
      const first = await list({ limit: 1 });
      expect((await list({ limit: 1, cursor: first.nextCursor })).items).toHaveLength(1);
      const byId = Object.fromEntries(
        (await list({})).items.map((i) => [i.booking.id, i.allowedActions]),
      );
      expect(byId[b.id]).toEqual(['cancel']);
      expect(byId[second.id]).toEqual([]); // has money
      expect(
        (await list({}, actor('support'))).items.every((i) => i.allowedActions.length === 0),
      ).toBe(true);
      await expect(list({}, actor('marketing'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('snapshots follow their source', () => {
    it('updates names on existing bookings when the customer or unit changes, ignoring stale events', async () => {
      const b = await book();
      const customer = (name, at) => ({
        ...event(EVENT.CUSTOMER_UPSERTED, {
          customer_id: CUSTOMER_REF.customerId,
          full_name: name,
          phone: null,
          email: 'ali@example.test',
        }),
        occurred_at: at,
      });
      await new ApplyCustomer(t.deps).execute(customer('Ali R. Khan', '2026-10-21T10:00:00.000Z'));
      await new ApplyCustomer(t.deps).execute(customer('Old Name', '2026-10-21T08:00:00.000Z'));
      expect(t.stores.bookings.get(b.id)).toMatchObject({
        buyerName: 'Ali R. Khan',
        buyerPhone: null,
      });
      const unit = (no, at) => ({
        ...event(EVENT.UNIT_UPSERTED, {
          unit_id: UNIT_REF.unitId,
          project_id: UNIT_REF.projectId,
          project_name: 'Gulberg Heights',
          unit_no: no,
          kind: 'plot',
          status: 'booked',
          list_price: 1,
          currency: 'PKR',
        }),
        occurred_at: at,
      });
      await new ApplyUnit(t.deps).execute(unit('A-99', '2026-10-21T10:00:00.000Z'));
      await new ApplyUnit(t.deps).execute(unit('A-00', '2026-10-21T08:00:00.000Z'));
      expect(t.stores.bookings.get(b.id)).toMatchObject({
        unitNo: 'A-99',
        projectName: 'Gulberg Heights',
      });
      expect(t.stores.unitRefs.get(UNIT_REF.unitId).status).toBe('booked');
    });
  });
});
