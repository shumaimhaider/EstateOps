import { EntitySchema } from 'typeorm';

const audit = {
  created_at: { type: 'timestamptz', insert: false, update: false },
  updated_at: { type: 'timestamptz', insert: false },
};

export const ProjectRow = new EntitySchema({
  name: 'ProjectRow',
  tableName: 'project',
  schema: 'inventory',
  columns: {
    id: { type: 'uuid', primary: true },
    tenant_id: { type: 'uuid' },
    name: { type: 'text' },
    location: { type: 'text' },
    kind: { type: 'text' },
    created_by: { type: 'uuid', nullable: true },
    ...audit,
    version: { type: 'int', insert: false },
  },
});

export const PhaseRow = new EntitySchema({
  name: 'PhaseRow',
  tableName: 'phase',
  schema: 'inventory',
  columns: {
    id: { type: 'uuid', primary: true },
    tenant_id: { type: 'uuid' },
    project_id: { type: 'uuid' },
    name: { type: 'text' },
    ...audit,
  },
});

export const BlockRow = new EntitySchema({
  name: 'BlockRow',
  tableName: 'block',
  schema: 'inventory',
  columns: {
    id: { type: 'uuid', primary: true },
    tenant_id: { type: 'uuid' },
    project_id: { type: 'uuid' },
    phase_id: { type: 'uuid', nullable: true },
    name: { type: 'text' },
    kind: { type: 'text' },
    geometry: { type: 'jsonb', nullable: true },
    ...audit,
  },
});

export const FloorRow = new EntitySchema({
  name: 'FloorRow',
  tableName: 'floor',
  schema: 'inventory',
  columns: {
    id: { type: 'uuid', primary: true },
    tenant_id: { type: 'uuid' },
    block_id: { type: 'uuid' },
    number: { type: 'int' },
    label: { type: 'text' },
    ...audit,
  },
});
