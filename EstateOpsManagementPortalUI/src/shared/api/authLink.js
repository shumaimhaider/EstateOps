/**
 * Shared auth link used by BOTH transports: bearer access token on every call,
 * single-flight refresh on 401, then one retry. The refresh call itself is
 * registered by the auth feature (it knows the wire shape); this file holds none.
 */
const REFRESH_KEY = 'estateops.refreshToken';
let accessToken = null;

function readRefresh() {
  try {
    return globalThis.sessionStorage?.getItem(REFRESH_KEY) ?? null;
  } catch {
    return null;
  }
}

export const tokenStore = {
  getAccess: () => accessToken,
  getRefresh: readRefresh,
  set(access, refresh) {
    accessToken = access;
    try {
      if (refresh) globalThis.sessionStorage?.setItem(REFRESH_KEY, refresh);
    } catch {
      /* sessionStorage unavailable: tokens stay in memory only */
    }
  },
  clear() {
    accessToken = null;
    try {
      globalThis.sessionStorage?.removeItem(REFRESH_KEY);
    } catch {
      /* ignore */
    }
  },
};

/** @type {null | (() => Promise<{ access: string, refresh?: string } | null>)} */
let refreshHandler = null;
let onAuthFailure = () => {};
let inFlight = null;

export function configureAuthLink({ refresh, onFailure }) {
  refreshHandler = refresh ?? null;
  onAuthFailure = onFailure ?? (() => {});
}

function refreshOnce() {
  if (!refreshHandler || !tokenStore.getRefresh()) return Promise.resolve(false);
  inFlight ??= refreshHandler()
    .then((tokens) => {
      if (!tokens) return false;
      tokenStore.set(tokens.access, tokens.refresh);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

function send(input, init) {
  const source = input instanceof Request ? input.clone() : input;
  const base = init?.headers ?? (source instanceof Request ? source.headers : undefined);
  const headers = new Headers(base);
  const token = tokenStore.getAccess();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return source instanceof Request
    ? fetch(new Request(source, { headers }))
    : fetch(source, { ...init, headers });
}

/** fetch() with auth. Used as the `fetch` of httpClient and graphqlClient. */
export async function authFetch(input, init) {
  let response = await send(input, init);
  if (response.status === 401 && (await refreshOnce())) {
    response = await send(input, init);
  } else if (response.status === 401) {
    onAuthFailure();
  }
  return response;
}
