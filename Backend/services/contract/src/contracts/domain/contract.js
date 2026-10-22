import {
  ConflictError,
  PERMISSION,
  defineMachine,
  fieldError,
  newId,
  to,
  validator,
} from '@estateops/kernel';

export const TEMPLATES = Object.freeze(['sale_agreement', 'payment_plan_addendum']);
export const TITLES = Object.freeze({
  sale_agreement: 'Sale agreement',
  payment_plan_addendum: 'Payment plan addendum',
});
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** A PandaDoc contract in one of these states is still being worked on. */
export const OPEN_STATUSES = Object.freeze(['draft', 'sent', 'viewed', 'declined']);

/**
 * draft -> sent -> viewed -> signed. Opened, signed and declined come from the signer (system).
 * Staff send, void or revise. A revision voids the version and opens the next one as a draft.
 */
export const contractMachine = defineMachine('contract', {
  draft: { send: to('sent'), revise: to('voided'), void: to('voided') },
  sent: {
    view: to('viewed', true),
    sign: to('signed', true),
    decline: to('declined', true),
    revise: to('voided'),
    void: to('voided'),
  },
  viewed: {
    sign: to('signed', true),
    decline: to('declined', true),
    revise: to('voided'),
    void: to('voided'),
  },
  signed: { void: to('voided') },
  declined: { revise: to('voided'), void: to('voided') },
  voided: {},
});

export const SIGNER_EVENTS = Object.freeze({ viewed: 'view', signed: 'sign', declined: 'decline' });

const isOpen = (c) => c.kind === 'pandadoc' && OPEN_STATUSES.includes(c.status);
export const hasSigned = (contracts) => contracts.some((c) => c.status === 'signed');
export const openOnes = (contracts) => contracts.filter(isOpen);
export const nextVersion = (contracts) => Math.max(0, ...contracts.map((c) => c.version)) + 1;

/**
 * What staff may do to a contract: its state and kind decide what is possible, the role who may.
 * A signed PandaDoc contract is final; a signed upload can be voided (a wrong file can be replaced).
 */
export function contractActions(contract, permissions) {
  if (!permissions.includes(PERMISSION.CONTRACTS_MANAGE)) return [];
  const actions = contractMachine.staffActions(contract.status);
  if (contract.kind === 'signed_upload') return actions.filter((a) => a === 'void');
  return actions.filter((a) =>
    a === 'revise' ? isOpen(contract) : a !== 'void' || contract.status !== 'signed',
  );
}

/** A new PandaDoc contract in draft, created from a template with the buyer as signer. */
export function createPandaDocContract(
  { tenantId, bookingId, template, signerEmail, version, documentId, createdByName },
  { id = newId() } = {},
) {
  if (!TEMPLATES.includes(template))
    throw fieldError('template', 'Choose a contract template', 'The contract could not be created');
  return {
    id,
    tenantId,
    bookingId,
    kind: 'pandadoc',
    title: TITLES[template],
    template,
    status: 'draft',
    version,
    supersedesId: null,
    revisionNote: null,
    fileKey: null,
    fileName: null,
    fileSize: null,
    contentType: null,
    providerDocumentId: documentId,
    signerEmail,
    sentAt: null,
    signedAt: null,
    createdByName,
  };
}

const looksLikePdf = (buffer) =>
  buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-';

/** The signed copy staff upload: a PDF of 1 byte to 10 MB, signed from the start. */
export function createSignedUpload(
  { tenantId, bookingId, file, title, version, fileKey, createdByName, now },
  { id = newId() } = {},
) {
  const v = validator('The contract could not be uploaded');
  const named = /\.pdf$/i.test(file?.name ?? '') || file?.contentType === 'application/pdf';
  const buffer = file?.buffer ?? Buffer.alloc(0);
  if (!file || !named || !looksLikePdf(buffer))
    v.add('file', 'Upload the signed contract as a PDF');
  else if (buffer.length < 1 || buffer.length > MAX_FILE_BYTES)
    v.add('file', 'The file must be between 1 byte and 10 MB');
  if (title !== undefined && title !== null)
    v.check(typeof title === 'string' && title.trim().length <= 80, 'title', 'Title is too long');
  v.done();
  return {
    id,
    tenantId,
    bookingId,
    kind: 'signed_upload',
    title: title?.trim() || 'Signed sale agreement',
    template: null,
    status: 'signed',
    version,
    supersedesId: null,
    revisionNote: null,
    fileKey,
    fileName: file.name?.replace(/[^\w. -]/g, '_') ?? 'contract.pdf',
    fileSize: file.buffer.length,
    contentType: 'application/pdf',
    providerDocumentId: null,
    signerEmail: null,
    sentAt: null,
    signedAt: now,
    createdByName,
  };
}

/** The next draft after a revision: same template and signer, version + 1, remembering why. */
export function reviseContract(
  previous,
  { note, version, documentId, createdByName },
  { id = newId() } = {},
) {
  const text = note?.trim();
  if (!text)
    throw fieldError('note', 'Say what is being changed', 'The contract could not be revised');
  if (text.length > 300)
    throw fieldError('note', 'The note is too long', 'The contract could not be revised');
  return {
    ...createPandaDocContract(
      {
        tenantId: previous.tenantId,
        bookingId: previous.bookingId,
        template: previous.template,
        signerEmail: previous.signerEmail,
        version,
        documentId,
        createdByName,
      },
      { id },
    ),
    title: previous.title,
    supersedesId: previous.id,
    revisionNote: text,
  };
}

/** Refuses to start another contract when one is signed or one is still open. */
export function assertCanStart(contracts) {
  if (hasSigned(contracts))
    throw new ConflictError(
      'CONTRACT_ALREADY_SIGNED',
      'This booking already has a signed contract',
    );
  if (openOnes(contracts).length > 0)
    throw new ConflictError(
      'CONTRACT_OPEN',
      'An unsigned contract is already open; revise it instead',
    );
}
