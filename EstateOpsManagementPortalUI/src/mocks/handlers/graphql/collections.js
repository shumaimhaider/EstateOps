import { graphql } from 'msw';
import { listEscalations, sendNotice } from '../../engine/escalations.js';
import { listInstallments, payInstallment } from '../../engine/installments.js';
import { collectionsStats } from '../../engine/stats.js';
import { listArgs, respondGraphql, toConnection } from './respond.js';

export const collectionsGraphqlHandlers = [
  graphql.query('Installments', ({ request, variables }) =>
    respondGraphql(request, {
      name: 'installments.list',
      perform: (db, ctx) => ({
        installments: toConnection(listInstallments(db, ctx, listArgs(variables))),
      }),
    }),
  ),
  graphql.mutation('PayInstallment', ({ request, variables }) =>
    respondGraphql(request, {
      name: 'installments.pay',
      write: true,
      perform: (db, ctx) => ({
        payInstallment: payInstallment(db, ctx, variables.id, variables.input),
      }),
    }),
  ),
  graphql.query('Escalations', ({ request, variables }) =>
    respondGraphql(request, {
      name: 'escalations.list',
      perform: (db, ctx) => ({
        escalations: toConnection(listEscalations(db, ctx, listArgs(variables))),
      }),
    }),
  ),
  graphql.mutation('SendEscalationNotice', ({ request, variables }) =>
    respondGraphql(request, {
      name: 'escalations.notice',
      write: true,
      perform: (db, ctx) => ({ sendEscalationNotice: sendNotice(db, ctx, variables.id) }),
    }),
  ),
  graphql.query('CollectionsStats', ({ request, variables }) =>
    respondGraphql(request, {
      name: 'stats.collections',
      perform: (db, ctx) => ({ collectionsStats: collectionsStats(db, ctx, variables) }),
    }),
  ),
];
