/**
 * Test-only gateway to the mock back end, so feature tests never import src/mocks directly.
 * (The app itself reaches mocks only through the bootstrap in main.jsx.)
 */
export { server } from '@/mocks/server.js';
export { getDb, resetDb } from '@/mocks/db/db.js';
export { mockToken } from '@/mocks/engine/context.js';
export { tokenStore } from '@/shared/api/authLink.js';
