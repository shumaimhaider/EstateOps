import { z } from 'zod';

/**
 * A sale contract of a booking: a signed PDF uploaded by staff, or a PandaDoc document.
 * @typedef {z.infer<typeof contractDtoSchema>} ContractDto
 */
export const contractDtoSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  booking_id: z.uuid(),
  kind: z.enum(['signed_upload', 'pandadoc']),
  title: z.string(),
  template: z.enum(['sale_agreement', 'payment_plan_addendum']).nullable(),
  status: z.enum(['draft', 'sent', 'viewed', 'signed', 'declined', 'voided']),
  version: z.number().int(),
  supersedes_id: z.uuid().nullable(),
  revision_note: z.string().nullable(),
  file_name: z.string().nullable(),
  file_size: z.number().int().nullable(),
  pandadoc_document_id: z.string().nullable(),
  pandadoc_url: z.string().nullable(),
  signer_email: z.string().nullable(),
  sent_at: z.iso.datetime().nullable(),
  signed_at: z.iso.datetime().nullable(),
  allowed_actions: z.array(z.string()),
  created_by_name: z.string().nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

/** POST /bookings/{id}/contracts/pandadoc */
export const pandaDocWriteDtoSchema = z.object({
  template: z.enum(['sale_agreement', 'payment_plan_addendum']),
});

/** POST /contracts/{id}/revise */
export const reviseWriteDtoSchema = z.object({ note: z.string().min(1) });

/** An embedded signing session for the buyer. The address only works for a short while. */
export const signingSessionDtoSchema = z.object({
  contract_id: z.string(),
  url: z.string().url(),
  expires_at: z.string(),
});
