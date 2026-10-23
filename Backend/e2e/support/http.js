import { randomUUID } from 'node:crypto';

export class ApiFailure extends Error {
  constructor(method, path, status, body) {
    super(`${method} ${path} -> ${status} ${JSON.stringify(body)}`);
    Object.assign(this, { status, body, code: body?.code ?? body?.error?.code });
  }
}

/** A small JSON client over fetch. Every write carries an Idempotency-Key unless one is passed. */
export function createClient(baseUrl, { token = null } = {}) {
  async function raw(method, path, { body, query, headers = {}, key, signal } = {}) {
    const url = new URL(path, baseUrl);
    for (const [k, v] of Object.entries(query ?? {}))
      if (v !== undefined) url.searchParams.set(k, v);
    const write = method !== 'GET' && method !== 'HEAD';
    return fetch(url, {
      method,
      signal,
      headers: {
        accept: 'application/json',
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(token && { authorization: `Bearer ${token}` }),
        ...(write && { 'idempotency-key': key ?? randomUUID() }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  async function call(method, path, options) {
    const res = await raw(method, path, options);
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ApiFailure(method, path, res.status, json);
    return json;
  }
  return {
    token,
    raw,
    withToken: (t) => createClient(baseUrl, { token: t }),
    get: (path, query) => call('GET', path, { query }),
    post: (path, body = {}, options) => call('POST', path, { body, ...options }),
    patch: (path, body) => call('PATCH', path, { body }),
    put: (path, body) => call('PUT', path, { body }),
    delete: (path) => call('DELETE', path),
    /** The status and body of a call that is expected to fail. */
    async fails(method, path, body) {
      const res = await raw(method, path, { body });
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    },
  };
}

/** Polls until `read()` returns something truthy (events settle within seconds). Returns it. */
export async function eventually(
  read,
  { timeoutMs = 20_000, everyMs = 150, what = 'condition' } = {},
) {
  const until = Date.now() + timeoutMs;
  let last;
  while (Date.now() < until) {
    try {
      last = await read();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await new Promise((r) => setTimeout(r, everyMs));
  }
  throw new Error(
    `Timed out waiting for ${what}${last instanceof Error ? `: ${last.message}` : ''}`,
  );
}
