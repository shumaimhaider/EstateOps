import { ConflictError } from '@estateops/kernel';
import { createQuery, keysetSql, pgCode, updateVersioned } from '@estateops/platform';
import { ProjectRow } from './entities.js';

const STATUSES = ['available', 'held', 'booked', 'sold', 'blocked'];

export const toProject = (row) => ({
  id: row.id,
  tenantId: row.tenant_id,
  name: row.name,
  location: row.location,
  kind: row.kind,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  version: row.version,
});

export class ProjectRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
    this.repo = manager.getRepository(ProjectRow);
  }

  async insert(project) {
    try {
      await this.repo.insert({
        id: project.id,
        tenant_id: project.tenantId,
        name: project.name,
        location: project.location,
        kind: project.kind,
        created_by: project.createdBy,
      });
    } catch (error) {
      if (pgCode(error) === '23505')
        throw new ConflictError('PROJECT_NAME_TAKEN', 'A project with this name already exists');
      throw error;
    }
    // the database fills created_at/updated_at: hand back the row as stored
    return (await this.findById(project.tenantId, project.id)) ?? project;
  }

  async findById(tenantId, id) {
    const row = await this.repo.findOneBy({ id, tenant_id: tenantId });
    return row ? toProject(row) : null;
  }

  async findByName(tenantId, name) {
    const row = await this.repo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId AND lower(p.name) = lower(:name)', { tenantId, name })
      .getOne();
    return row ? toProject(row) : null;
  }

  async update(project) {
    const version = await updateVersioned(this.manager, ProjectRow, {
      where: { id: project.id, tenant_id: project.tenantId },
      version: project.version,
      set: { name: project.name, location: project.location, kind: project.kind },
    }).catch((error) => {
      if (pgCode(error) === '23505')
        throw new ConflictError('PROJECT_NAME_TAKEN', 'A project with this name already exists');
      throw error;
    });
    return { ...project, version };
  }

  async delete(tenantId, id) {
    await this.repo.delete({ id, tenant_id: tenantId });
  }

  async childCounts(tenantId, id) {
    const [row] = await this.manager.query(
      `SELECT (SELECT count(*)::int FROM inventory.unit WHERE tenant_id = $1 AND project_id = $2) AS units,
              (SELECT count(*)::int FROM inventory.phase WHERE tenant_id = $1 AND project_id = $2) AS phases,
              (SELECT count(*)::int FROM inventory.block WHERE tenant_id = $1 AND project_id = $2) AS blocks`,
      [tenantId, id],
    );
    return row;
  }

  async #countsFor(tenantId, ids) {
    const byProject = new Map(
      ids.map((id) => [id, Object.fromEntries(STATUSES.map((s) => [s, 0]))]),
    );
    if (ids.length === 0) return byProject;
    const rows = await this.manager.query(
      `SELECT project_id, status, count(*)::int AS n FROM inventory.unit
        WHERE tenant_id = $1 AND project_id = ANY($2::uuid[]) GROUP BY project_id, status`,
      [tenantId, ids],
    );
    for (const { project_id: id, status, n } of rows) byProject.get(id)[status] = n;
    return byProject;
  }

  #withCounts(project, counts) {
    return {
      project,
      unitCounts: counts,
      unitsTotal: Object.values(counts).reduce((a, b) => a + b, 0),
    };
  }

  async findWithCounts(tenantId, id) {
    const project = await this.findById(tenantId, id);
    if (!project) return null;
    return this.#withCounts(project, (await this.#countsFor(tenantId, [id])).get(id));
  }

  async list(tenantId, { cursor, limit }) {
    const q = createQuery();
    q.and('p.tenant_id = ?', tenantId);
    const page = await keysetSql(this.manager, {
      select: 'p.*',
      from: 'FROM inventory.project p',
      query: q,
      sort: { expr: 'lower(p.name)', dir: 'asc', cast: 'text' },
      idExpr: 'p.id',
      cursor,
      limit,
      valueOf: (r) => r.name.toLowerCase(),
      idOf: (r) => r.id,
    });
    const counts = await this.#countsFor(
      tenantId,
      page.rows.map((r) => r.id),
    );
    return {
      items: page.rows.map((r) => this.#withCounts(toProject(r), counts.get(r.id))),
      nextCursor: page.nextCursor,
    };
  }
}
