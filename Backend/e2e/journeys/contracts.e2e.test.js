import { describe, expect, it } from 'vitest';
import { eventually } from '../support/http.js';
import { useStack } from '../support/suite.js';

const ctx = useStack();
const A = '/api/v1/admin';
const P = '/api/v1/portal';

async function booked() {
  const { w } = ctx;
  const t = await w.tenantWithStaff({ roles: ['sales_manager', 'sales_agent'] });
  const s = await w.seedSales(t.owner);
  const booking = await w.book(t.owner, s);
  const me = await w.portalCustomer(t.owner, t, s.customer);
  return { w, t, s, booking, me };
}
const signer = (docId, action) =>
  fetch(`${ctx.stack.pandadoc.url}/_mock/documents/${docId}/${action}`, { method: 'POST' });
const statusOf = (t, bookingId, id) => async () =>
  (await t.owner.get(`${A}/contracts`, { booking_id: bookingId })).data.find((c) => c.id === id)
    ?.status;

describe('contracts and PandaDoc signing', () => {
  it('drafts from a template, sends, and the buyer signs on screen; PandaDoc’s webhook makes it final', async () => {
    const { t, booking, me } = await booked();
    const draft = await t.staff.sales_manager.post(
      `${A}/bookings/${booking.id}/contracts/pandadoc`,
      { template: 'sale_agreement' },
    );
    expect(draft).toMatchObject({
      kind: 'pandadoc',
      status: 'draft',
      version: 1,
      template: 'sale_agreement',
    });
    // nothing for the customer to sign while it is a draft
    expect(
      (await me.api.get(`${P}/properties/${booking.id}/contracts`)).data.find(
        (c) => c.id === draft.id,
      )?.can_sign ?? false,
    ).toBe(false);

    const sent = await t.staff.sales_manager.post(`${A}/contracts/${draft.id}/send`, {});
    expect(sent.status).toBe('sent');
    const mine = (await me.api.get(`${P}/properties/${booking.id}/contracts`)).data;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ can_sign: true, can_download: false });

    const session = await me.api.post(`${P}/contracts/${draft.id}/signing-session`, {});
    expect(session.url).toContain('/s/');

    // the signer opens it, then signs: PandaDoc tells us by signed webhook, never staff
    const docId = sent.pandadoc_document_id;
    await signer(docId, 'view');
    await eventually(async () => (await statusOf(t, booking.id, draft.id)()) === 'viewed', {
      what: 'viewed',
    });
    await signer(docId, 'sign');
    await eventually(async () => (await statusOf(t, booking.id, draft.id)()) === 'signed', {
      what: 'signed',
    });

    const after = (await me.api.get(`${P}/properties/${booking.id}/contracts`)).data[0];
    expect(after).toMatchObject({ status: 'signed', can_sign: false, can_download: true });
    const pdf = await me.api.raw('GET', `${P}/contracts/${draft.id}/file`);
    expect(pdf.status).toBe(200);
    expect(
      Buffer.from(await pdf.arrayBuffer())
        .subarray(0, 4)
        .toString(),
    ).toBe('%PDF');
  });

  it('records a decline from the signer and lets staff revise it with a note into the next version', async () => {
    const { t, booking } = await booked();
    const draft = await t.staff.sales_manager.post(
      `${A}/bookings/${booking.id}/contracts/pandadoc`,
      { template: 'payment_plan_addendum' },
    );
    const sent = await t.staff.sales_manager.post(`${A}/contracts/${draft.id}/send`, {});
    await signer(sent.pandadoc_document_id, 'decline');
    await eventually(async () => (await statusOf(t, booking.id, draft.id)()) === 'declined', {
      what: 'declined',
    });

    expect(
      (await t.staff.sales_manager.fails('POST', `${A}/contracts/${draft.id}/revise`, {})).status,
    ).toBe(422);
    const next = await t.staff.sales_manager.post(`${A}/contracts/${draft.id}/revise`, {
      note: 'Fix the plot number',
    });
    expect(next).toMatchObject({ status: 'draft', version: 2, supersedes_id: draft.id });
    expect(await statusOf(t, booking.id, draft.id)()).toBe('voided');
  });

  it('allows only one open PandaDoc contract per booking, and none once one is signed', async () => {
    const { t, booking } = await booked();
    const first = await t.staff.sales_manager.post(
      `${A}/bookings/${booking.id}/contracts/pandadoc`,
      { template: 'sale_agreement' },
    );
    expect(
      (
        await t.staff.sales_manager.fails(
          'POST',
          `${A}/bookings/${booking.id}/contracts/pandadoc`,
          { template: 'payment_plan_addendum' },
        )
      ).status,
    ).toBe(409);
    const sent = await t.staff.sales_manager.post(`${A}/contracts/${first.id}/send`, {});
    await signer(sent.pandadoc_document_id, 'sign');
    await eventually(async () => (await statusOf(t, booking.id, first.id)()) === 'signed', {
      what: 'signed',
    });
    expect(
      (
        await t.staff.sales_manager.fails(
          'POST',
          `${A}/bookings/${booking.id}/contracts/pandadoc`,
          { template: 'payment_plan_addendum' },
        )
      ).status,
    ).toBe(409);
    // a signed PandaDoc contract is final
    expect(
      (await t.staff.sales_manager.fails('POST', `${A}/contracts/${first.id}/void`, {})).status,
    ).toBe(409);
    expect(
      (
        await t.staff.sales_manager.fails('POST', `${A}/contracts/${first.id}/revise`, {
          note: 'again',
        })
      ).status,
    ).toBe(409);
  });

  it('refuses contract management to a role without the permission, but lets them look', async () => {
    const { t, booking } = await booked();
    const out = await t.staff.sales_agent.fails(
      'POST',
      `${A}/bookings/${booking.id}/contracts/pandadoc`,
      { template: 'sale_agreement' },
    );
    expect(out.status).toBe(403);
    expect(
      (await t.staff.sales_agent.get(`${A}/contracts`, { booking_id: booking.id })).data,
    ).toEqual([]);
  });

  it('cancelling the booking voids its open contract', async () => {
    const { t, booking } = await booked();
    const draft = await t.staff.sales_manager.post(
      `${A}/bookings/${booking.id}/contracts/pandadoc`,
      { template: 'sale_agreement' },
    );
    await t.staff.sales_manager.post(`${A}/contracts/${draft.id}/send`, {});
    await t.owner.post(`${A}/bookings/${booking.id}/cancel`, { reason: 'withdrawn' });
    await eventually(async () => (await statusOf(t, booking.id, draft.id)()) === 'voided', {
      what: 'contract voided',
    });
  });

  it('rejects a forged PandaDoc webhook', async () => {
    const { w } = ctx;
    const res = await w.anon.raw('POST', '/webhooks/pandadoc', {
      body: [{ event: 'document_state_changed', data: { id: 'x', status: 'document.completed' } }],
      query: { signature: 'deadbeef' },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
