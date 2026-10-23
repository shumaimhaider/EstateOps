import { beforeEach, describe, expect, it } from 'vitest';
import { EVENT, buildEvent } from '@estateops/contracts';
import { ValidationError } from '@estateops/kernel';
import { TEST_TENANT_A, TEST_TENANT_B, eventsOfType } from '@estateops/platform/testing';
import {
  MAX_FILE_BYTES,
  TEMPLATES,
  assertCanStart,
  contractActions,
  contractMachine,
  createPandaDocContract,
  createSignedUpload,
  hasSigned,
  nextVersion,
  openOnes,
  reviseContract,
} from '../src/contracts/domain/contract.js';
import { ListContracts } from '../src/contracts/application/ListContracts.js';
import { UploadSignedContract } from '../src/contracts/application/UploadSignedContract.js';
import { CreatePandaDocContract } from '../src/contracts/application/CreatePandaDocContract.js';
import { ActOnContract } from '../src/contracts/application/ActOnContract.js';
import { SimulateSignerEvent } from '../src/contracts/application/SimulateSignerEvent.js';
import { DownloadContractFile } from '../src/contracts/application/DownloadContractFile.js';
import { ApplyBookingConfirmed } from '../src/refs/application/ApplyBookingConfirmed.js';
import { ApplyBookingCancelled } from '../src/refs/application/ApplyBookingCancelled.js';
import { PDF, actor, buildContractTest, upload, uuid } from './fakes.js';

const fieldsOf = (fn) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ValidationError);
    return e.details.map((d) => d.field);
  }
  throw new Error('expected a validation error');
};
const MANAGE = ['contracts.manage', 'contracts.view'];

describe('contract domain', () => {
  const draft = (over = {}) =>
    createPandaDocContract({
      tenantId: 't',
      bookingId: 'b',
      template: 'sale_agreement',
      signerEmail: 'a@x.test',
      version: 1,
      documentId: 'pd_1',
      createdByName: 'S',
      ...over,
    });

  it('starts a PandaDoc contract in draft with the template title and the buyer as signer', () => {
    expect(draft()).toMatchObject({
      kind: 'pandadoc',
      status: 'draft',
      title: 'Sale agreement',
      signerEmail: 'a@x.test',
      version: 1,
      fileKey: null,
      supersedesId: null,
    });
    expect(draft({ template: 'payment_plan_addendum' }).title).toBe('Payment plan addendum');
    expect(fieldsOf(() => draft({ template: 'nda' }))).toEqual(['template']);
    expect(TEMPLATES).toEqual(['sale_agreement', 'payment_plan_addendum']);
  });
  it('creates a signed upload for PDFs only, 1 byte to 10 MB, signed from the start', () => {
    const make = (file, title) =>
      createSignedUpload({
        tenantId: 't',
        bookingId: 'b',
        file,
        title,
        version: 1,
        fileKey: 't/b/x.pdf',
        createdByName: 'S',
        now: new Date('2026-10-21T09:00:00Z'),
      });
    expect(make(upload())).toMatchObject({
      kind: 'signed_upload',
      status: 'signed',
      title: 'Signed sale agreement',
      fileName: 'signed.pdf',
      fileSize: PDF.length,
      contentType: 'application/pdf',
      signedAt: new Date('2026-10-21T09:00:00Z'),
    });
    expect(make(upload(), '  Deed  ').title).toBe('Deed');
    expect(make(upload({ name: 'blob', contentType: 'application/pdf' })).fileName).toBe('blob');
    expect(fieldsOf(() => make(upload({ name: 'scan.png', contentType: 'image/png' })))).toEqual([
      'file',
    ]);
    expect(fieldsOf(() => make(upload({ buffer: Buffer.from('<html>not a pdf') })))).toEqual([
      'file',
    ]);
    expect(fieldsOf(() => make(upload({ buffer: Buffer.alloc(0) })))).toEqual(['file']);
    expect(
      fieldsOf(() => make(upload({ buffer: Buffer.concat([PDF, Buffer.alloc(MAX_FILE_BYTES)]) }))),
    ).toEqual(['file']);
    expect(fieldsOf(() => make(undefined))).toEqual(['file']);
    expect(fieldsOf(() => make(upload(), 'x'.repeat(81)))).toEqual(['title']);
    expect(make(upload({ name: '../../etc/pa$$wd.pdf' })).fileName).not.toMatch(/[/$]/);
  });
  it('revises into the next draft, keeping template and signer, and needs a note', () => {
    const next = reviseContract(draft(), {
      note: ' Corrected price ',
      version: 2,
      documentId: 'pd_2',
      createdByName: 'S',
    });
    expect(next).toMatchObject({
      version: 2,
      status: 'draft',
      supersedesId: expect.any(String),
      revisionNote: 'Corrected price',
      template: 'sale_agreement',
      signerEmail: 'a@x.test',
      providerDocumentId: 'pd_2',
    });
    expect(
      fieldsOf(() => reviseContract(draft(), { note: '  ', version: 2, documentId: 'x' })),
    ).toEqual(['note']);
    expect(
      fieldsOf(() =>
        reviseContract(draft(), { note: 'n'.repeat(301), version: 2, documentId: 'x' }),
      ),
    ).toEqual(['note']);
  });
  it('follows draft -> sent -> viewed -> signed, with void, revise and decline where allowed', () => {
    expect(contractMachine.transition('draft', 'send')).toBe('sent');
    expect(contractMachine.transition('sent', 'view')).toBe('viewed');
    expect(contractMachine.transition('viewed', 'sign')).toBe('signed');
    expect(contractMachine.transition('declined', 'revise')).toBe('voided');
    expect(() => contractMachine.transition('signed', 'revise')).toThrow(
      expect.objectContaining({ code: 'INVALID_TRANSITION' }),
    );
    expect(() => contractMachine.transition('voided', 'send')).toThrow(
      /Cannot send a contract that is voided/,
    );
  });
  it('shows staff the right actions by state, kind and role', () => {
    const as = (status, kind = 'pandadoc', perms = MANAGE) =>
      contractActions({ ...draft(), status, kind }, perms);
    expect(as('draft')).toEqual(['send', 'revise', 'void']);
    expect(as('sent')).toEqual(['revise', 'void', 'sign_on_screen']);
    expect(as('viewed')).toEqual(['revise', 'void', 'sign_on_screen']);
    expect(as('declined')).toEqual(['revise', 'void']);
    expect(as('signed')).toEqual([]); // a signed PandaDoc contract is final
    expect(as('voided')).toEqual([]);
    expect(as('signed', 'signed_upload')).toEqual(['void']); // a wrong upload can be replaced
    expect(as('draft', 'pandadoc', ['contracts.view'])).toEqual([]);
  });
  it('counts versions upward, spots signed and open contracts, and refuses a second', () => {
    const list = [
      { version: 1, status: 'voided', kind: 'pandadoc' },
      { version: 2, status: 'sent', kind: 'pandadoc' },
    ];
    expect(nextVersion(list)).toBe(3);
    expect(nextVersion([])).toBe(1);
    expect(openOnes(list)).toHaveLength(1);
    expect(hasSigned(list)).toBe(false);
    expect(() => assertCanStart(list)).toThrow(expect.objectContaining({ code: 'CONTRACT_OPEN' }));
    expect(() => assertCanStart([{ version: 1, status: 'signed', kind: 'pandadoc' }])).toThrow(
      expect.objectContaining({ code: 'CONTRACT_ALREADY_SIGNED' }),
    );
    expect(() =>
      assertCanStart([{ version: 1, status: 'voided', kind: 'pandadoc' }]),
    ).not.toThrow();
  });
});

describe('contract use cases', () => {
  let t;
  let sales;
  const list = (a = sales, bookingId = uuid(500)) =>
    new ListContracts(t.deps).execute({ actor: a, bookingId });
  const create = (template = 'sale_agreement', a = sales) =>
    new CreatePandaDocContract(t.deps).execute({ actor: a, bookingId: uuid(500), template });
  const act = (id, action, extra = {}, a = sales) =>
    new ActOnContract(t.deps).execute({ actor: a, id, action, ...extra });
  const simulate = (id, event, a = sales) =>
    new SimulateSignerEvent(t.deps).execute({ actor: a, id, event });
  const send = (id, event) => act(id, 'send').then(() => simulate(id, event));
  const statuses = () =>
    eventsOfType(t.events, 'contract.status_changed').map((e) => e.data.status);

  beforeEach(async () => {
    t = await buildContractTest();
    sales = actor('sales_manager');
  });

  describe('drafting and sending with PandaDoc', () => {
    it('drafts from a template with the buyer as signer, and tells the provider', async () => {
      const { contract, allowedActions } = await create();
      expect(contract).toMatchObject({
        status: 'draft',
        version: 1,
        signerEmail: 'ali@example.test',
        createdByName: 'Sam Sales',
      });
      expect(allowedActions).toEqual(['send', 'revise', 'void']);
      expect(t.esign.documents.get(contract.providerDocumentId)).toMatchObject({
        template: 'sale_agreement',
        signerEmail: 'ali@example.test',
        sent: false,
      });
      expect(t.auditEntries.at(-1)).toMatchObject({
        action: 'contract.create',
        after: { template: 'sale_agreement', version: 1 },
      });
      expect(statuses()).toEqual(['draft']);
    });
    it('sends for signing, then follows the signer: opened, signed, with times stamped', async () => {
      const { contract } = await create();
      const sent = await act(contract.id, 'send');
      expect(sent.contract).toMatchObject({
        status: 'sent',
        sentAt: new Date('2026-10-21T09:00:00Z'),
      });
      expect(t.esign.documents.get(contract.providerDocumentId).sent).toBe(true);
      expect((await simulate(contract.id, 'viewed')).contract.status).toBe('viewed');
      const signed = await simulate(contract.id, 'signed');
      expect(signed.contract).toMatchObject({
        status: 'signed',
        signedAt: new Date('2026-10-21T09:00:00Z'),
      });
      expect(signed.allowedActions).toEqual([]);
      expect(statuses()).toEqual(['draft', 'sent', 'viewed', 'signed']);
    });
    it('records a decline and lets it be revised', async () => {
      const { contract } = await create();
      expect((await send(contract.id, 'declined')).contract.status).toBe('declined');
      expect(
        (await act(contract.id, 'revise', { note: 'Buyer wants a longer plan' })).contract.version,
      ).toBe(2);
    });
    it('refuses a second contract while one is open or signed, and unknown templates', async () => {
      const { contract } = await create();
      await expect(create('payment_plan_addendum')).rejects.toMatchObject({
        code: 'CONTRACT_OPEN',
      });
      await send(contract.id, 'signed');
      await expect(create()).rejects.toMatchObject({ code: 'CONTRACT_ALREADY_SIGNED' });
      const fresh = await buildContractTest();
      await expect(
        new CreatePandaDocContract(fresh.deps).execute({
          actor: sales,
          bookingId: uuid(500),
          template: 'nda',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
    it('cannot send a contract to a buyer without an email', async () => {
      t.stores.bookingRefs.get(uuid(500)).customerEmail = null;
      const { contract } = await create();
      await expect(act(contract.id, 'send')).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'signer_email', message: expect.any(String) }],
      });
    });
    it('voids a draft, telling the provider, and nothing more can be done to it', async () => {
      const { contract } = await create();
      expect((await act(contract.id, 'void')).contract.status).toBe('voided');
      expect(t.esign.documents.get(contract.providerDocumentId).voided).toBe(true);
      await expect(act(contract.id, 'send')).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
      expect((await create()).contract.version).toBe(2); // a new one may start
    });
  });

  describe('revising', () => {
    it('voids the version and opens the next as a draft that remembers why, listed newest first', async () => {
      const { contract } = await create();
      await act(contract.id, 'send');
      const revised = await act(contract.id, 'revise', { note: 'Corrected plot price' });
      expect(revised.contract).toMatchObject({
        version: 2,
        status: 'draft',
        supersedesId: contract.id,
        revisionNote: 'Corrected plot price',
        title: 'Sale agreement',
      });
      expect(revised.allowedActions).toEqual(['send', 'revise', 'void']);
      expect(t.esign.documents.get(contract.providerDocumentId).voided).toBe(true);
      expect(t.esign.documents.get(revised.contract.providerDocumentId).voided).toBe(false);
      const { items } = await list();
      expect(items.map((i) => [i.contract.version, i.contract.status])).toEqual([
        [2, 'draft'],
        [1, 'voided'],
      ]);
    });
    it('needs a note, and works from draft, sent, viewed and declined only', async () => {
      const { contract } = await create();
      await expect(act(contract.id, 'revise', { note: '  ' })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
      await expect(act(contract.id, 'revise')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      const second = await buildContractTest();
      const signed = await new CreatePandaDocContract(second.deps).execute({
        actor: sales,
        bookingId: uuid(500),
        template: 'sale_agreement',
      });
      await new ActOnContract(second.deps).execute({
        actor: sales,
        id: signed.contract.id,
        action: 'send',
      });
      await new SimulateSignerEvent(second.deps).execute({
        actor: sales,
        id: signed.contract.id,
        event: 'signed',
      });
      await expect(
        new ActOnContract(second.deps).execute({
          actor: sales,
          id: signed.contract.id,
          action: 'revise',
          note: 'x',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
      await expect(
        new ActOnContract(second.deps).execute({
          actor: sales,
          id: signed.contract.id,
          action: 'void',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    });
  });

  describe('uploading a signed copy', () => {
    it('stores the PDF, signs the contract from the start, audits and announces it', async () => {
      const { contract, allowedActions } = await new UploadSignedContract(t.deps).execute({
        actor: sales,
        bookingId: uuid(500),
        file: upload(),
        title: 'Signed deed',
      });
      expect(contract).toMatchObject({
        kind: 'signed_upload',
        status: 'signed',
        title: 'Signed deed',
        version: 1,
        fileName: 'signed.pdf',
      });
      expect(allowedActions).toEqual(['void']);
      expect([...t.files.files.keys()]).toEqual([contract.fileKey]);
      expect(contract.fileKey).toMatch(new RegExp(`^${TEST_TENANT_A}/${uuid(500)}/.+\\.pdf$`));
      expect(t.auditEntries.at(-1)).toMatchObject({ action: 'contract.upload' });
      expect(statuses()).toEqual(['signed']);
    });
    it('voids any open PandaDoc contract it replaces, at the provider too', async () => {
      const { contract: draft } = await create();
      await new UploadSignedContract(t.deps).execute({
        actor: sales,
        bookingId: uuid(500),
        file: upload(),
      });
      const items = (await list()).items.map((i) => [i.contract.kind, i.contract.status]);
      expect(items).toEqual([
        ['signed_upload', 'signed'],
        ['pandadoc', 'voided'],
      ]);
      expect(t.esign.documents.get(draft.providerDocumentId).voided).toBe(true);
    });
    it('refuses a second signed copy, but a wrong one can be voided and replaced', async () => {
      const first = await new UploadSignedContract(t.deps).execute({
        actor: sales,
        bookingId: uuid(500),
        file: upload(),
      });
      await expect(
        new UploadSignedContract(t.deps).execute({
          actor: sales,
          bookingId: uuid(500),
          file: upload(),
        }),
      ).rejects.toMatchObject({ code: 'CONTRACT_ALREADY_SIGNED' });
      expect(t.files.files.size).toBe(1);
      await act(first.contract.id, 'void');
      const second = await new UploadSignedContract(t.deps).execute({
        actor: sales,
        bookingId: uuid(500),
        file: upload({ name: 'right.pdf' }),
      });
      expect(second.contract.version).toBe(2);
    });
    it('refuses a bad file and stores nothing', async () => {
      for (const file of [
        undefined,
        upload({ name: 'a.png', contentType: 'image/png' }),
        upload({ buffer: Buffer.from('nope') }),
      ]) {
        await expect(
          new UploadSignedContract(t.deps).execute({ actor: sales, bookingId: uuid(500), file }),
        ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      }
      expect(t.files.files.size).toBe(0);
    });
    it('removes the stored file again if the save fails', async () => {
      const failing = {
        ...t.deps,
        uow: {
          run: (work) =>
            t.deps.uow.run(async (repos) =>
              work({
                ...repos,
                contracts: {
                  ...repos.contracts,
                  insert: async () => {
                    throw new Error('db down');
                  },
                },
              }),
            ),
          read: t.deps.uow.read,
        },
      };
      await expect(
        new UploadSignedContract(failing).execute({
          actor: sales,
          bookingId: uuid(500),
          file: upload(),
        }),
      ).rejects.toThrow('db down');
      expect(t.files.files.size).toBe(0);
    });
    it('downloads an uploaded file, and a PandaDoc contract only once it is signed', async () => {
      const { contract } = await new UploadSignedContract(t.deps).execute({
        actor: sales,
        bookingId: uuid(500),
        file: upload(),
      });
      const file = await new DownloadContractFile(t.deps).execute({
        actor: actor('support'),
        id: contract.id,
      });
      expect(file).toMatchObject({ fileName: 'signed.pdf', contentType: 'application/pdf' });
      expect(file.buffer.equals(PDF)).toBe(true);
      const { contract: draft } = await buildContractTest().then(async (x) => ((t = x), create()));
      await expect(
        new DownloadContractFile(t.deps).execute({ actor: sales, id: draft.id }),
      ).rejects.toMatchObject({ code: 'NOT_SIGNED' });
      await expect(
        new DownloadContractFile(t.deps).execute({ actor: sales, id: uuid(404) }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('who may do what', () => {
    it('lets a sales agent and support read contracts but not change them', async () => {
      const { contract } = await create();
      for (const role of ['sales_agent', 'support', 'finance']) {
        const a = actor(role);
        expect((await list(a)).items[0].allowedActions).toEqual([]);
        await expect(act(contract.id, 'send', {}, a)).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await expect(create('sale_agreement', a)).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await expect(
          new UploadSignedContract(t.deps).execute({
            actor: a,
            bookingId: uuid(500),
            file: upload(),
          }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      }
    });
    it('hides contracts from roles without contracts.view', async () => {
      await expect(list(actor('dealer_manager'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(list(actor('marketing'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
    it('keeps tenants apart', async () => {
      const { contract } = await create();
      const stranger = actor('owner', { tenantId: TEST_TENANT_B });
      await expect(list(stranger)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(act(contract.id, 'send', {}, stranger)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await expect(
        new CreatePandaDocContract(t.deps).execute({
          actor: stranger,
          bookingId: uuid(500),
          template: 'sale_agreement',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(simulate(contract.id, 'signed', stranger)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
    it('only a PandaDoc contract has a signer, and unknown signer events are refused', async () => {
      const upload1 = await new UploadSignedContract(t.deps).execute({
        actor: sales,
        bookingId: uuid(500),
        file: upload(),
      });
      await expect(simulate(upload1.contract.id, 'signed')).rejects.toMatchObject({
        code: 'INVALID_TRANSITION',
      });
      await expect(simulate(upload1.contract.id, 'exploded')).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    });
  });

  describe('booking events', () => {
    const confirmed = (over = {}) =>
      buildEvent({
        type: EVENT.BOOKING_CONFIRMED,
        tenantId: TEST_TENANT_A,
        producer: 'sales',
        data: {
          booking_id: uuid(600),
          unit: {
            id: uuid(101),
            unit_no: 'B-02',
            kind: 'plot',
            project_id: uuid(201),
            project_name: 'P',
          },
          customer: { id: uuid(302), full_name: 'Bilal', phone: null, email: 'bilal@example.test' },
          plan: { name: 'p', down_pct: 20, installment_count: 12 },
          total_price: 1000,
          currency: 'PKR',
          booked_at: '2026-10-21',
          ...over,
        },
      });
    const cancelled = (bookingId) =>
      buildEvent({
        type: EVENT.BOOKING_CANCELLED,
        tenantId: TEST_TENANT_A,
        producer: 'sales',
        data: { booking_id: bookingId, unit_id: uuid(101), customer_id: uuid(301) },
      });

    it('learns a new booking and its buyer so contracts can be drafted, once per event', async () => {
      const event = confirmed();
      await new ApplyBookingConfirmed(t.deps).execute(event);
      expect((await new ApplyBookingConfirmed(t.deps).execute(event)).duplicate).toBe(true);
      const { contract } = await new CreatePandaDocContract(t.deps).execute({
        actor: sales,
        bookingId: uuid(600),
        template: 'sale_agreement',
      });
      expect(contract.signerEmail).toBe('bilal@example.test');
    });
    it('voids every open contract when the booking is cancelled, and no new one can start', async () => {
      const { contract } = await create();
      await new ApplyBookingCancelled(t.deps).execute(cancelled(uuid(500)));
      expect((await list()).items[0].contract.status).toBe('voided');
      expect(t.esign.documents.get(contract.providerDocumentId).voided).toBe(true);
      await expect(create()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
    it('leaves a signed contract alone when the booking is cancelled', async () => {
      await new UploadSignedContract(t.deps).execute({
        actor: sales,
        bookingId: uuid(500),
        file: upload(),
      });
      await new ApplyBookingCancelled(t.deps).execute(cancelled(uuid(500)));
      expect((await list()).items[0].contract.status).toBe('signed');
    });
    it('remembers a cancellation that arrives before the booking, so a late confirmation cannot revive it', async () => {
      await new ApplyBookingCancelled(t.deps).execute(cancelled(uuid(600)));
      await new ApplyBookingConfirmed(t.deps).execute(confirmed());
      expect(t.stores.bookingRefs.get(uuid(600)).cancelled).toBe(true);
      await expect(
        new CreatePandaDocContract(t.deps).execute({
          actor: sales,
          bookingId: uuid(600),
          template: 'sale_agreement',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
