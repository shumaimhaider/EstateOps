import { authGraphqlHandlers } from './graphql/auth.js';
import { collectionsGraphqlHandlers } from './graphql/collections.js';
import { customerGraphqlHandlers } from './graphql/customers.js';
import { projectGraphqlHandlers } from './graphql/projects.js';
import { salesGraphqlHandlers } from './graphql/sales.js';
import { unitGraphqlHandlers } from './graphql/units.js';
import { authRestHandlers } from './rest/auth.js';
import { collectionsRestHandlers } from './rest/collections.js';
import { customerRestHandlers } from './rest/customers.js';
import { projectRestHandlers } from './rest/projects.js';
import { salesRestHandlers } from './rest/sales.js';
import { unitRestHandlers } from './rest/units.js';

/** One file per feature per transport, over the same DB and engine. */
export const handlers = [
  ...authRestHandlers,
  ...unitRestHandlers,
  ...projectRestHandlers,
  ...salesRestHandlers,
  ...customerRestHandlers,
  ...collectionsRestHandlers,
  ...authGraphqlHandlers,
  ...unitGraphqlHandlers,
  ...projectGraphqlHandlers,
  ...salesGraphqlHandlers,
  ...customerGraphqlHandlers,
  ...collectionsGraphqlHandlers,
];
