import { appendAudit } from './audit.js';
import { nowIso } from './clock.js';
import { MockApiError } from './errors.js';
import { requirePermission } from './permissions.js';
import { allowedActions, transition } from './stateMachines.js';

/**
 * Sale contracts per booking. A contract is either a signed copy uploaded by staff, or a
 * PandaDoc document that goes draft -> sent -> viewed -> signed (signing events come from
 * PandaDoc). Revising an open PandaDoc contract voids it and opens the next version as a draft.
 */
export const TEMPLATES = ['sale_agreement', 'payment_plan_addendum'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const OPEN = ['draft', 'sent', 'viewed', 'declined'];

const bookingFor = (db, ctx, id) => {
  const booking = db.bookings.find((b) => b.id === id && b.tenant_id === ctx.tenant.id);
  if (!booking) throw new MockApiError(404, 'NOT_FOUND', 'Booking not found');
  return booking;
};

function contractFor(db, ctx, id) {
  const row = db.contracts.find((c) => c.id === id && c.tenant_id === ctx.tenant.id);
  if (!row) throw new MockApiError(404, 'NOT_FOUND', 'Contract not found');
  return row;
}

/** Staff actions: state machine and role, with the rules that signed PandaDoc contracts are final. */
function actionsFor(row, user) {
  const actions = allowedActions('document', row, user);
  if (row.kind === 'signed_upload') return actions.filter((a) => a === 'void');
  const open = OPEN.includes(row.status);
  return actions.filter((a) => (a === 'revise' ? open : a !== 'void' || row.status !== 'signed'));
}

const toDto = (row, ctx) => ({
  id: row.id,
  tenant_id: row.tenant_id,
  booking_id: row.booking_id,
  kind: row.kind,
  title: row.title,
  template: row.template,
  status: row.status,
  version: row.version,
  supersedes_id: row.supersedes_id,
  revision_note: row.revision_note,
  file_name: row.file_name,
  file_size: row.file_size,
  pandadoc_document_id: row.pandadoc_document_id,
  pandadoc_url: row.pandadoc_document_id
    ? `https://app.pandadoc.com/a/#/documents/${row.pandadoc_document_id}`
    : null,
  signer_email: row.signer_email,
  sent_at: row.sent_at,
  signed_at: row.signed_at,
  allowed_actions: actionsFor(row, ctx.user),
  created_by_name: row.created_by_name,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export function listContracts(db, ctx, { booking_id: bookingId }) {
  requirePermission(ctx, 'contracts.view');
  bookingFor(db, ctx, bookingId);
  const items = db.contracts
    .filter((c) => c.booking_id === bookingId && c.tenant_id === ctx.tenant.id)
    .sort((a, b) => b.version - a.version || b.created_at.localeCompare(a.created_at))
    .map((c) => toDto(c, ctx));
  return { items, cursors: items.map(() => ''), nextCursor: null };
}

const nextVersion = (db, bookingId) =>
  Math.max(0, ...db.contracts.filter((c) => c.booking_id === bookingId).map((c) => c.version)) + 1;

function insert(db, ctx, booking, fields) {
  const at = nowIso(db.clock);
  const row = {
    id: globalThis.crypto.randomUUID(),
    tenant_id: ctx.tenant.id,
    booking_id: booking.id,
    template: null,
    supersedes_id: null,
    revision_note: null,
    file_name: null,
    file_size: null,
    pandadoc_document_id: null,
    signer_email: null,
    sent_at: null,
    signed_at: null,
    version: nextVersion(db, booking.id),
    created_by_name: ctx.user.name,
    created_at: at,
    updated_at: at,
    ...fields,
  };
  db.contracts.push(row);
  appendAudit(db, {
    actor: ctx.user,
    action: `contract.${fields.kind === 'signed_upload' ? 'upload' : 'create'}`,
    subjectType: 'contract',
    subjectId: row.id,
    after: { booking_id: booking.id, kind: row.kind, version: row.version, status: row.status },
  });
  return row;
}

function setStatus(db, ctx, row, action) {
  const before = { status: row.status };
  row.status = transition('document', row.status, action);
  row.updated_at = nowIso(db.clock);
  appendAudit(db, {
    actor: ctx.user,
    action: `contract.${action}`,
    subjectType: 'contract',
    subjectId: row.id,
    before,
    after: { status: row.status },
  });
}

const hasSigned = (db, bookingId) =>
  db.contracts.some((c) => c.booking_id === bookingId && c.status === 'signed');
const openOnes = (db, bookingId) =>
  db.contracts.filter(
    (c) => c.booking_id === bookingId && c.kind === 'pandadoc' && OPEN.includes(c.status),
  );

/** Staff upload the paper-signed contract (PDF). It replaces any PandaDoc draft still open. */
export function uploadSignedContract(
  db,
  ctx,
  bookingId,
  { fileName, fileSize, contentType, title },
) {
  requirePermission(ctx, 'contracts.manage');
  const booking = bookingFor(db, ctx, bookingId);
  const errors = [];
  const isPdf = contentType === 'application/pdf' || /\.pdf$/i.test(fileName ?? '');
  if (!fileName || !isPdf)
    errors.push({ field: 'file', message: 'Upload the signed contract as a PDF' });
  else if (!(fileSize > 0) || fileSize > MAX_FILE_BYTES) {
    errors.push({ field: 'file', message: 'The file must be between 1 byte and 10 MB' });
  }
  if (errors.length) {
    throw new MockApiError(422, 'VALIDATION_ERROR', 'The contract could not be uploaded', errors);
  }
  if (hasSigned(db, bookingId)) {
    throw new MockApiError(
      409,
      'CONTRACT_ALREADY_SIGNED',
      'This booking already has a signed contract',
    );
  }
  for (const open of openOnes(db, bookingId)) setStatus(db, ctx, open, 'void');
  const at = nowIso(db.clock);
  const row = insert(db, ctx, booking, {
    kind: 'signed_upload',
    title: title?.trim() || 'Signed sale agreement',
    status: 'signed',
    file_name: fileName,
    file_size: fileSize,
    signed_at: at,
  });
  return toDto(row, ctx);
}

/** Starts a PandaDoc document for the booking from a template; the signer is the buyer. */
export function createPandaDocContract(db, ctx, bookingId, body) {
  requirePermission(ctx, 'contracts.manage');
  const booking = bookingFor(db, ctx, bookingId);
  if (!TEMPLATES.includes(body.template)) {
    throw new MockApiError(422, 'VALIDATION_ERROR', 'The contract could not be created', [
      { field: 'template', message: 'Choose a contract template' },
    ]);
  }
  if (hasSigned(db, bookingId)) {
    throw new MockApiError(
      409,
      'CONTRACT_ALREADY_SIGNED',
      'This booking already has a signed contract',
    );
  }
  if (openOnes(db, bookingId).length) {
    throw new MockApiError(
      409,
      'CONTRACT_OPEN',
      'An unsigned contract is already open; revise it instead',
    );
  }
  const customer = db.customers.find((c) => c.id === booking.customer_id);
  const row = insert(db, ctx, booking, {
    kind: 'pandadoc',
    title: body.template === 'sale_agreement' ? 'Sale agreement' : 'Payment plan addendum',
    template: body.template,
    status: 'draft',
    pandadoc_document_id: `pd_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    signer_email: customer.email,
  });
  return toDto(row, ctx);
}

/** send | void | revise. Revise returns the new draft version; the old one is voided. */
export function actOnContract(db, ctx, id, action, body = {}) {
  const row = contractFor(db, ctx, id);
  if (!actionsFor(row, ctx.user).includes(action)) {
    throw new MockApiError(
      409,
      'INVALID_TRANSITION',
      `Cannot ${action} a contract that is ${row.status}`,
    );
  }
  if (action === 'revise') {
    const note = body.note?.trim();
    if (!note) {
      throw new MockApiError(422, 'VALIDATION_ERROR', 'The contract could not be revised', [
        { field: 'note', message: 'Say what is being changed' },
      ]);
    }
    setStatus(db, ctx, row, 'revise');
    const booking = bookingFor(db, ctx, row.booking_id);
    const next = insert(db, ctx, booking, {
      kind: 'pandadoc',
      title: row.title,
      template: row.template,
      status: 'draft',
      supersedes_id: row.id,
      revision_note: note,
      pandadoc_document_id: `pd_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      signer_email: row.signer_email,
    });
    return toDto(next, ctx);
  }
  setStatus(db, ctx, row, action);
  if (action === 'send') row.sent_at = row.updated_at;
  return toDto(row, ctx);
}

/** Mock only: PandaDoc webhook events (the signer opened, signed or declined the document). */
export function simulateContractEvent(db, ctx, id, event) {
  requirePermission(ctx, 'contracts.manage');
  const row = contractFor(db, ctx, id);
  const action = { viewed: 'view', signed: 'sign', declined: 'decline' }[event];
  if (!action) throw new MockApiError(400, 'INVALID_EVENT', 'Unknown PandaDoc event');
  setStatus(db, ctx, row, action);
  if (action === 'sign') row.signed_at = row.updated_at;
  return toDto(row, ctx);
}
