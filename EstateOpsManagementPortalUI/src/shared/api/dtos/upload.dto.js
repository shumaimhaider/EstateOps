import { z } from 'zod';

/** What the server returns when asked for somewhere to upload a file. */
export const uploadTicketDtoSchema = z.object({
  asset_id: z.string(),
  upload: z.object({
    method: z.literal('PUT'),
    url: z.string(),
    headers: z.record(z.string(), z.string()),
    expires_in: z.number(),
  }),
});

/** @typedef {{ assetId: string, method: 'PUT', url: string, headers: Record<string,string>, expiresIn: number }} UploadTicket */
/** @returns {UploadTicket} */
export const ticketFromApi = (dto) => ({
  assetId: dto.asset_id,
  method: dto.upload.method,
  url: dto.upload.url,
  headers: dto.upload.headers,
  expiresIn: dto.upload.expires_in,
});

/** Form values -> the request body that asks for a signed URL. */
export const ticketRequestToApi = ({ file, kind }) => ({
  ...(kind ? { kind } : {}),
  filename: file.name,
  content_type: file.type,
  size: file.size,
});
