import { setupServer } from 'msw/node';
import { handlers } from './handlers/index.js';

/** Node/Vitest server using the same handlers as the browser worker. */
export const server = setupServer(...handlers);
