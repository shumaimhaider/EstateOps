import { httpClient } from '@/shared/api/httpClient.js';

/** REST calls for pictures and site maps. Uploads go to storage on signed URLs, not through here. */
export const mediaRest = {
  unitUploadUrl: (unitId, body, { idempotencyKey } = {}) =>
    httpClient.post(`/admin/units/${unitId}/media/upload-url`, body, { idempotencyKey }),
  addUnitMedia: (unitId, body, { idempotencyKey } = {}) =>
    httpClient.post(`/admin/units/${unitId}/media`, body, { idempotencyKey }),
  removeUnitMedia: (unitId, mediaId, { idempotencyKey } = {}) =>
    httpClient.delete(`/admin/units/${unitId}/media/${mediaId}`, { idempotencyKey }),
  mapUploadUrl: (projectId, body, { idempotencyKey } = {}) =>
    httpClient.post(`/admin/projects/${projectId}/map/upload-url`, body, { idempotencyKey }),
  confirmMap: (projectId, body, { idempotencyKey } = {}) =>
    httpClient.put(`/admin/projects/${projectId}/map`, body, { idempotencyKey }),
};
