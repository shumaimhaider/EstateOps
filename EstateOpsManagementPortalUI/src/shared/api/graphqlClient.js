import { ClientError, GraphQLClient } from 'graphql-request';
import { config } from '@/shared/config/config.js';
import { newIdempotencyKey } from '@/shared/lib/idempotencyKey.js';
import { authFetch } from './authLink.js';
import { fromGraphQLErrors, fromNetworkError } from './ApiError.js';

let client = null;
function getClient() {
  client ??= new GraphQLClient(config.graphqlUrl, { fetch: authFetch });
  return client;
}

async function run(document, variables, { headers, signal } = {}) {
  try {
    return await getClient().request({
      document,
      variables,
      requestHeaders: headers,
      signal,
    });
  } catch (cause) {
    if (cause instanceof ClientError) {
      throw fromGraphQLErrors(cause.response.errors, cause.response.status);
    }
    throw fromNetworkError(cause);
  }
}

/**
 * GraphQL transport primitive. Returns the RAW `data` object. Errors become the
 * same ApiError as REST. Mutations carry the same Idempotency-Key header.
 */
export const graphqlClient = {
  query: (document, variables, options) => run(document, variables, options),
  mutate: (document, variables, { idempotencyKey, signal } = {}) =>
    run(document, variables, {
      signal,
      headers: { 'Idempotency-Key': idempotencyKey ?? newIdempotencyKey() },
    }),
};
