import { ApiError } from './ApiError.js';

/**
 * Sends the file straight to the storage provider on a signed URL. No auth header: the
 * signature is the credential, and the file never passes through our API.
 */
export async function putToSignedUrl(ticket, file, { signal } = {}) {
  let response;
  try {
    response = await fetch(ticket.url, {
      method: ticket.method,
      headers: ticket.headers,
      body: file,
      signal,
    });
  } catch {
    throw new ApiError({ code: 'UPLOAD_NETWORK', message: 'The upload could not be completed' });
  }
  if (!response.ok) {
    throw new ApiError({
      code: 'UPLOAD_REFUSED',
      message: 'The storage service refused the file',
      status: response.status,
    });
  }
}
