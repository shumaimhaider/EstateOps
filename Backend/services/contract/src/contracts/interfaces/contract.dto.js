import { z } from 'zod';
import { toIso } from '@estateops/kernel';

export const listContractsQuery = z.object({ booking_id: z.string().min(1, 'Choose a booking') });
export const pandaDocRequest = z.object({ template: z.string() });
export const reviseRequest = z.object({ note: z.string().optional() });

/** One contract in the shape the UI parses. The PandaDoc link is built from the provider document id. */
export const toContractResponse = ({ contract: k, allowedActions }) => ({
  id: k.id,
  tenant_id: k.tenantId,
  booking_id: k.bookingId,
  kind: k.kind,
  title: k.title,
  template: k.template,
  status: k.status,
  version: k.version,
  supersedes_id: k.supersedesId,
  revision_note: k.revisionNote,
  file_name: k.fileName,
  file_size: k.fileSize,
  pandadoc_document_id: k.providerDocumentId,
  pandadoc_url: k.providerDocumentId
    ? `https://app.pandadoc.com/a/#/documents/${k.providerDocumentId}`
    : null,
  signer_email: k.signerEmail,
  sent_at: toIso(k.sentAt),
  signed_at: toIso(k.signedAt),
  allowed_actions: allowedActions,
  created_by_name: k.createdByName,
  created_at: toIso(k.createdAt),
  updated_at: toIso(k.updatedAt),
});
