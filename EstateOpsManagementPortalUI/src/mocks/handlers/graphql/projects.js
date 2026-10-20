import { graphql } from 'msw';
import { getProject, listProjects, projectMap } from '../../engine/projects.js';
import { respondGraphql, toConnection } from './respond.js';

export const projectGraphqlHandlers = [
  graphql.query('Projects', ({ request, variables }) =>
    respondGraphql(request, {
      name: 'projects.list',
      perform: (db, ctx) => ({ projects: toConnection(listProjects(db, ctx, variables)) }),
    }),
  ),
  graphql.query('Project', ({ request, variables }) =>
    respondGraphql(request, {
      name: 'projects.get',
      perform: (db, ctx) => ({ project: getProject(db, ctx, variables.id) }),
    }),
  ),
  graphql.query('ProjectMap', ({ request, variables }) =>
    respondGraphql(request, {
      name: 'projects.map',
      perform: (db, ctx) => ({ projectMap: projectMap(db, ctx, variables.id) }),
    }),
  ),
];
