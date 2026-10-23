const FIELD_TO_WIRE = { file: 'file', template: 'template', note: 'note' };
const WIRE_TO_FIELD = Object.fromEntries(Object.entries(FIELD_TO_WIRE).map(([k, v]) => [v, k]));

/** @returns {import('../../../features/contracts/domain/contract.model.js').Contract} */
export function fromApi(dto) {
  return {
    id: dto.id,
    bookingId: dto.booking_id,
    kind: dto.kind,
    title: dto.title,
    template: dto.template,
    status: dto.status,
    version: dto.version,
    supersedesId: dto.supersedes_id,
    revisionNote: dto.revision_note,
    fileName: dto.file_name,
    fileSize: dto.file_size,
    pandaDocUrl: dto.pandadoc_url,
    signerEmail: dto.signer_email,
    sentAt: dto.sent_at,
    signedAt: dto.signed_at,
    allowedActions: dto.allowed_actions,
    createdByName: dto.created_by_name,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

export const sessionFromApi = (dto) => ({
  contractId: dto.contract_id,
  url: dto.url,
  expiresAt: dto.expires_at,
});

/** Multipart body for the signed-contract upload. */
export function uploadToApi({ file, title }) {
  const form = new FormData();
  form.append('file', file, file.name);
  if (title) form.append('title', title);
  return form;
}

export const pandaDocToApi = ({ template }) => ({ template });
export const reviseToApi = ({ note }) => ({ note });

export function fieldErrorsFromApi(fieldErrors) {
  return Object.fromEntries(
    Object.entries(fieldErrors ?? {}).map(([wire, message]) => [
      WIRE_TO_FIELD[wire] ?? wire,
      message,
    ]),
  );
}
