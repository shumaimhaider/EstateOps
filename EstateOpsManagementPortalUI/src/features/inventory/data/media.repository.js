import { parseDto } from '@/shared/api/contract.js';
import { putToSignedUrl } from '@/shared/api/putToSignedUrl.js';
import {
  ticketFromApi,
  ticketRequestToApi,
  uploadTicketDtoSchema,
} from '@/shared/api/dtos/upload.dto.js';
import { unitMediaDtoSchema } from '@/shared/api/dtos/unit.dto.js';
import { mediaFromApi } from '@/shared/api/dtos/unit.mapper.js';
import { projectMapDtoSchema } from '@/shared/api/dtos/project.dto.js';
import { mapFromApi } from '@/shared/api/dtos/project.mapper.js';
import { mediaRest } from './transport/media.rest.js';

/**
 * Pictures and site maps. Each upload is three steps: ask for a signed URL, send the file to
 * storage, then tell the API it is there. Steps are separate calls so a retry only repeats
 * what failed.
 */
export function createMediaRepository({ transport = mediaRest, upload = putToSignedUrl } = {}) {
  const ticket = (raw) => ticketFromApi(parseDto(uploadTicketDtoSchema, raw, 'upload ticket'));
  return {
    /** @returns {Promise<import('../domain/unit.model.js').UnitMedia>} */
    async addUnitPicture(
      unitId,
      { file, kind = 'image', caption = '' },
      { idempotencyKey, signal } = {},
    ) {
      const signed = ticket(
        await transport.unitUploadUrl(unitId, ticketRequestToApi({ file, kind }), {
          idempotencyKey,
        }),
      );
      await upload(signed, file, { signal });
      const raw = await transport.addUnitMedia(
        unitId,
        { kind, asset_id: signed.assetId, caption: caption || null },
        { idempotencyKey: `${idempotencyKey ?? signed.assetId}:attach` },
      );
      return mediaFromApi(parseDto(unitMediaDtoSchema, raw, 'unit picture'));
    },
    removeUnitPicture(unitId, mediaId, { idempotencyKey } = {}) {
      return transport.removeUnitMedia(unitId, mediaId, { idempotencyKey });
    },
    /** @returns {Promise<import('../domain/project.model.js').ProjectMap>} */
    async uploadProjectMap(projectId, { file }, { idempotencyKey, signal } = {}) {
      const signed = ticket(
        await transport.mapUploadUrl(projectId, ticketRequestToApi({ file }), { idempotencyKey }),
      );
      await upload(signed, file, { signal });
      const raw = await transport.confirmMap(
        projectId,
        { asset_id: signed.assetId },
        { idempotencyKey: `${idempotencyKey ?? signed.assetId}:confirm` },
      );
      return mapFromApi(parseDto(projectMapDtoSchema, raw, 'project map'));
    },
  };
}

export const mediaRepository = createMediaRepository();
