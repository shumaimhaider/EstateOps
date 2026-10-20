import { graphql } from 'msw';
import { actOnUnit, createUnit, getUnit, listUnits } from '../../engine/units.js';
import { respondGraphql, toConnection } from './respond.js';

export const unitGraphqlHandlers = [
  graphql.query('Units', ({ request, variables }) =>
    respondGraphql(request, {
      name: 'units.list',
      perform: (db, ctx) => {
        const { filter, sort, cursor, limit } = variables;
        return { units: toConnection(listUnits(db, ctx, { ...filter, sort, cursor, limit })) };
      },
    }),
  ),
  graphql.query('Unit', ({ request, variables }) =>
    respondGraphql(request, {
      name: 'units.get',
      perform: (db, ctx) => ({ unit: getUnit(db, ctx, variables.id) }),
    }),
  ),
  graphql.mutation('CreateUnit', ({ request, variables }) =>
    respondGraphql(request, {
      name: 'units.create',
      write: true,
      perform: (db, ctx) => ({ createUnit: createUnit(db, ctx, variables.input) }),
    }),
  ),
  graphql.mutation('BlockUnit', ({ request, variables }) =>
    respondGraphql(request, {
      name: 'units.block',
      write: true,
      perform: (db, ctx) => ({ blockUnit: actOnUnit(db, ctx, variables.id, 'block') }),
    }),
  ),
  graphql.mutation('UnblockUnit', ({ request, variables }) =>
    respondGraphql(request, {
      name: 'units.unblock',
      write: true,
      perform: (db, ctx) => ({ unblockUnit: actOnUnit(db, ctx, variables.id, 'unblock') }),
    }),
  ),
];
