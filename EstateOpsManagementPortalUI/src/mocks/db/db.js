import { loadPersisted, savePersisted } from './persistence.js';
import { buildSeed } from './seed.js';

/** Bump when the seed shape changes so stale localStorage data is discarded. */
export const SEED_VERSION = 4;

let state = null;

export function getDb() {
  if (!state) {
    const persisted = loadPersisted();
    state = persisted?.seedVersion === SEED_VERSION ? persisted : buildSeed(SEED_VERSION);
    savePersisted(state);
  }
  return state;
}

/** Call after any mutation. */
export function persist() {
  if (state) savePersisted(state);
}

export function resetDb() {
  state = buildSeed(SEED_VERSION);
  savePersisted(state);
  return state;
}
