import { describe, expect, it } from 'vitest';
import { getDb, mockToken, tokenStore } from '@/test/mockServer.js';
import { createContractsRepository } from './contracts.repository.js';

const repo = createContractsRepository();
const pdf = (name = 'signed.pdf', type = 'application/pdf') =>
  new File(['%PDF-1.4 contract'], name, { type });

const activeBooking = () => {
  const db = getDb();
  return db.bookings.find((b) => b.tenant_id === db.tenants[0].id && b.status === 'active');
};
const asRole = (role) => tokenStore.set(mockToken('pk', role));

describe('uploading the signed contract', () => {
  it('stores a signed PDF against the booking', async () => {
    const booking = activeBooking();
    expect(await repo.list(booking.id)).toEqual([]);
    const contract = await repo.uploadSigned(booking.id, {
      file: pdf(),
      title: 'Signed sale deed',
    });
    expect(contract).toMatchObject({
      kind: 'signed_upload',
      status: 'signed',
      title: 'Signed sale deed',
      version: 1,
    });
    // jsdom's File loses its name when Node's fetch serialises the multipart body; browsers keep it
    expect(contract.fileName).toBeTruthy();
    expect(contract.allowedActions).toEqual(['void']);
    expect(await repo.list(booking.id)).toHaveLength(1);
  });

  it('accepts PDFs only', async () => {
    const booking = activeBooking();
    await expect(
      repo.uploadSigned(booking.id, { file: pdf('scan.png', 'image/png') }),
    ).rejects.toMatchObject({ status: 422, fieldErrors: { file: expect.any(String) } });
  });

  it('refuses a second signed contract, but lets a wrongly uploaded one be voided and replaced', async () => {
    const booking = activeBooking();
    const first = await repo.uploadSigned(booking.id, { file: pdf() });
    await expect(repo.uploadSigned(booking.id, { file: pdf() })).rejects.toMatchObject({
      status: 409,
      code: 'CONTRACT_ALREADY_SIGNED',
    });
    await repo.void(first.id);
    const second = await repo.uploadSigned(booking.id, { file: pdf('right.pdf') });
    expect(second.version).toBe(2);
  });

  it('replaces any PandaDoc contract still open when the paper copy arrives', async () => {
    const booking = activeBooking();
    const draft = await repo.createPandaDoc(booking.id, { template: 'sale_agreement' });
    await repo.uploadSigned(booking.id, { file: pdf() });
    const list = await repo.list(booking.id);
    expect(list.find((c) => c.id === draft.id).status).toBe('voided');
  });
});

describe('PandaDoc contracts', () => {
  it('goes from draft to sent to signed, signed by the buyer', async () => {
    const booking = activeBooking();
    const buyer = getDb().customers.find((c) => c.id === booking.customer_id);
    const draft = await repo.createPandaDoc(booking.id, { template: 'sale_agreement' });
    expect(draft).toMatchObject({ status: 'draft', kind: 'pandadoc', signerEmail: buyer.email });
    expect(draft.pandaDocUrl).toMatch(/pandadoc\.com/);
    expect(draft.allowedActions).toEqual(expect.arrayContaining(['send', 'revise', 'void']));

    expect((await repo.send(draft.id)).status).toBe('sent');
    expect((await repo.simulateEvent(draft.id, 'viewed')).status).toBe('viewed');
    const signed = await repo.simulateEvent(draft.id, 'signed');
    expect(signed.status).toBe('signed');
    expect(signed.signedAt).not.toBeNull();
    // a signed PandaDoc contract is final
    expect(signed.allowedActions).toEqual([]);
  });

  it('allows one open contract at a time and none once signed', async () => {
    const booking = activeBooking();
    const draft = await repo.createPandaDoc(booking.id, { template: 'sale_agreement' });
    await expect(
      repo.createPandaDoc(booking.id, { template: 'payment_plan_addendum' }),
    ).rejects.toMatchObject({ status: 409, code: 'CONTRACT_OPEN' });
    await repo.send(draft.id);
    await repo.simulateEvent(draft.id, 'signed');
    await expect(
      repo.createPandaDoc(booking.id, { template: 'sale_agreement' }),
    ).rejects.toMatchObject({ status: 409, code: 'CONTRACT_ALREADY_SIGNED' });
  });

  it('revises an open contract: the old version is voided and the next one is a new draft', async () => {
    const booking = activeBooking();
    const v1 = await repo.createPandaDoc(booking.id, { template: 'sale_agreement' });
    await repo.send(v1.id);

    await expect(repo.revise(v1.id, { note: '  ' })).rejects.toMatchObject({
      fieldErrors: { note: expect.any(String) },
    });
    const v2 = await repo.revise(v1.id, { note: 'Corrected plot price' });
    expect(v2).toMatchObject({
      version: 2,
      status: 'draft',
      supersedesId: v1.id,
      revisionNote: 'Corrected plot price',
    });
    const list = await repo.list(booking.id);
    expect(list.map((c) => [c.version, c.status])).toEqual([
      [2, 'draft'],
      [1, 'voided'],
    ]);
    // a voided version cannot be touched again
    await expect(repo.send(v1.id)).rejects.toMatchObject({ status: 409 });
  });

  it('lets a declined contract be revised and sent again', async () => {
    const booking = activeBooking();
    const v1 = await repo.createPandaDoc(booking.id, { template: 'sale_agreement' });
    await repo.send(v1.id);
    const declined = await repo.simulateEvent(v1.id, 'declined');
    expect(declined.allowedActions).toContain('revise');
    expect((await repo.revise(v1.id, { note: 'Buyer asked for a longer plan' })).version).toBe(2);
  });

  it('seeds a signed PandaDoc contract for every completed sale', () => {
    const db = getDb();
    const completed = db.bookings.filter((b) => b.status === 'completed');
    expect(completed.length).toBeGreaterThan(0);
    for (const booking of completed) {
      expect(
        db.contracts.filter((c) => c.booking_id === booking.id && c.status === 'signed'),
      ).toHaveLength(1);
    }
  });
});

describe('who may do what with contracts', () => {
  it('lets a sales agent read contracts but not change them', async () => {
    const booking = activeBooking();
    asRole('sales_agent');
    await expect(repo.list(booking.id)).resolves.toEqual([]);
    await expect(
      repo.createPandaDoc(booking.id, { template: 'sale_agreement' }),
    ).rejects.toMatchObject({
      status: 403,
    });
    await expect(repo.uploadSigned(booking.id, { file: pdf() })).rejects.toMatchObject({
      status: 403,
    });
  });

  it('hides contracts from roles without contracts.view, and offers no actions without manage', async () => {
    const booking = activeBooking();
    const draft = await repo.createPandaDoc(booking.id, { template: 'sale_agreement' });
    asRole('dealer_manager');
    await expect(repo.list(booking.id)).rejects.toMatchObject({ status: 403 });
    asRole('support');
    expect((await repo.list(booking.id))[0].allowedActions).toEqual([]);
    await expect(repo.send(draft.id)).rejects.toMatchObject({ status: 409 });
  });
});
