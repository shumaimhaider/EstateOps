import { ConflictError } from '@estateops/kernel';
import { pgCode } from '@estateops/platform';
import { BlockRow, FloorRow, PhaseRow } from '../../projects/infrastructure/entities.js';

const toPhase = (r) => ({ id: r.id, tenantId: r.tenant_id, projectId: r.project_id, name: r.name });
const toBlock = (r) => ({
  id: r.id,
  tenantId: r.tenant_id,
  projectId: r.project_id,
  phaseId: r.phase_id,
  name: r.name,
  kind: r.kind,
  geometry: r.geometry,
});
const toFloor = (r) => ({
  id: r.id,
  tenantId: r.tenant_id,
  blockId: r.block_id,
  number: r.number,
  label: r.label,
});

export class StructureRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
    this.phases = manager.getRepository(PhaseRow);
    this.blocks = manager.getRepository(BlockRow);
    this.floors = manager.getRepository(FloorRow);
  }

  async #exists(sql, params) {
    const rows = await this.manager.query(`SELECT 1 FROM ${sql} LIMIT 1`, params);
    return rows.length > 0;
  }

  // phases
  async insertPhase(p) {
    await this.phases
      .insert({ id: p.id, tenant_id: p.tenantId, project_id: p.projectId, name: p.name })
      .catch(translate('PHASE_NAME_TAKEN', 'This project already has a phase with that name'));
    return p;
  }
  async findPhase(tenantId, id) {
    const r = await this.phases.findOneBy({ id, tenant_id: tenantId });
    return r ? toPhase(r) : null;
  }
  phaseNameTaken = (projectId, name) =>
    this.#exists('inventory.phase WHERE project_id = $1 AND lower(name) = lower($2)', [
      projectId,
      name,
    ]);
  phaseInUse = (tenantId, id) =>
    this.#exists(
      `(SELECT id FROM inventory.block WHERE tenant_id = $1 AND phase_id = $2
        UNION ALL SELECT id FROM inventory.unit WHERE tenant_id = $1 AND phase_id = $2) x`,
      [tenantId, id],
    );
  async deletePhase(tenantId, id) {
    await this.phases.delete({ id, tenant_id: tenantId });
  }
  async listPhases(tenantId, projectId) {
    return (
      await this.phases.find({
        where: { tenant_id: tenantId, project_id: projectId },
        order: { name: 'ASC' },
      })
    ).map(toPhase);
  }

  // blocks
  async insertBlock(b) {
    await this.blocks
      .insert({
        id: b.id,
        tenant_id: b.tenantId,
        project_id: b.projectId,
        phase_id: b.phaseId,
        name: b.name,
        kind: b.kind,
      })
      .catch(translate('BLOCK_NAME_TAKEN', 'This project already has a block with that name'));
    return b;
  }
  async findBlock(tenantId, id) {
    const r = await this.blocks.findOneBy({ id, tenant_id: tenantId });
    return r ? toBlock(r) : null;
  }
  blockNameTaken = (projectId, name) =>
    this.#exists('inventory.block WHERE project_id = $1 AND lower(name) = lower($2)', [
      projectId,
      name,
    ]);
  blockInUse = (tenantId, id) =>
    this.#exists(
      `(SELECT id FROM inventory.floor WHERE tenant_id = $1 AND block_id = $2
        UNION ALL SELECT id FROM inventory.unit WHERE tenant_id = $1 AND block_id = $2) x`,
      [tenantId, id],
    );
  async updateBlock(b) {
    await this.blocks
      .update(
        { id: b.id, tenant_id: b.tenantId },
        { name: b.name, kind: b.kind, phase_id: b.phaseId, updated_at: () => 'now()' },
      )
      .catch(translate('BLOCK_NAME_TAKEN', 'This project already has a block with that name'));
    return b;
  }
  async deleteBlock(tenantId, id) {
    await this.blocks.delete({ id, tenant_id: tenantId });
  }
  async listBlocks(tenantId, projectId) {
    return (
      await this.blocks.find({
        where: { tenant_id: tenantId, project_id: projectId },
        order: { name: 'ASC' },
      })
    ).map(toBlock);
  }
  async saveBlockGeometry(tenantId, items) {
    for (const { blockId, geometry } of items) {
      await this.blocks.update(
        { id: blockId, tenant_id: tenantId },
        { geometry, updated_at: () => 'now()' },
      );
    }
  }

  // floors
  async insertFloor(f) {
    await this.floors
      .insert({
        id: f.id,
        tenant_id: f.tenantId,
        block_id: f.blockId,
        number: f.number,
        label: f.label,
      })
      .catch(translate('FLOOR_NUMBER_TAKEN', 'This block already has that floor'));
    return f;
  }
  async findFloor(tenantId, id) {
    const r = await this.floors.findOneBy({ id, tenant_id: tenantId });
    return r ? toFloor(r) : null;
  }
  floorNumberTaken = (blockId, number) =>
    this.#exists('inventory.floor WHERE block_id = $1 AND number = $2', [blockId, number]);
  floorInUse = (tenantId, id) =>
    this.#exists('inventory.unit WHERE tenant_id = $1 AND floor_id = $2', [tenantId, id]);
  async deleteFloor(tenantId, id) {
    await this.floors.delete({ id, tenant_id: tenantId });
  }
  async listFloorsOfProject(tenantId, projectId) {
    const rows = await this.manager.query(
      `SELECT f.* FROM inventory.floor f JOIN inventory.block b ON b.id = f.block_id
        WHERE f.tenant_id = $1 AND b.project_id = $2 ORDER BY b.name, f.number`,
      [tenantId, projectId],
    );
    return rows.map(toFloor);
  }
}

const translate = (code, message) => (error) => {
  if (pgCode(error) === '23505') throw new ConflictError(code, message);
  throw error;
};
