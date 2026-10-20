import { config } from '@/shared/config/config.js';
import { newIdempotencyKey } from '@/shared/lib/idempotencyKey.js';
import { authFetch } from './authLink.js';
import { fromNetworkError, fromRestError } from './ApiError.js';

function buildUrl(path, query) {
  const url = `${config.apiBaseUrl}${path}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * REST transport primitive. Returns the RAW parsed JSON body and nothing else:
 * it never renames fields. Every write carries an Idempotency-Key.
 */
async function request(method, path, { query, body, idempotencyKey, signal } = {}) {
  const headers = { Accept: 'application/json' };
  const isWrite = method !== 'GET';
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (isWrite) headers['Idempotency-Key'] = idempotencyKey ?? newIdempotencyKey();

  let response;
  try {
    response = await authFetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    throw fromNetworkError(cause);
  }

  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!response.ok) throw fromRestError(response.status, json);
  return json;
}

export const httpClient = {
  get: (path, options) => request('GET', path, options),
  post: (path, body, options) => request('POST', path, { ...options, body }),
  put: (path, body, options) => request('PUT', path, { ...options, body }),
  patch: (path, body, options) => request('PATCH', path, { ...options, body }),
  delete: (path, options) => request('DELETE', path, options),
};
