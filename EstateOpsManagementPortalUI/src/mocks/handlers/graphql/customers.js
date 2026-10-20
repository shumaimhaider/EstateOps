import { graphql } from 'msw';
import { getCustomer, listCustomers } from '../../engine/customers.js';
import { listArgs, respondGraphql, toConnection } from './respond.js';

export const customerGraphqlHandlers = [
  graphql.query('Customers', ({ request, variables }) =>
    respondGraphql(request, {
      name: 'customers.list',
      perform: (db, ctx) => ({
        customers: toConnection(listCustomers(db, ctx, listArgs(variables))),
      }),
    }),
  ),
  graphql.query('Customer', ({ request, variables }) =>
    respondGraphql(request, {
      name: 'customers.get',
      perform: (db, ctx) => ({ customer: getCustomer(db, ctx, variables.id) }),
    }),
  ),
];
