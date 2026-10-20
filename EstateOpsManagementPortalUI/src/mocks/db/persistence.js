const STORAGE_KEY = 'estateops.mockdb.v1';
let enabled = true;

/** Tests turn persistence off so each test starts from the in-memory seed. */
export function setPersistence(value) {
  enabled = value;
}

export function loadPersisted() {
  if (!enabled) return null;
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function savePersisted(state) {
  if (!enabled) return;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded or storage blocked: the in-memory DB keeps working */
  }
}

export function clearPersisted() {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
