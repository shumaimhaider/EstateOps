import { EntitySchema } from 'typeorm';

export const TenantRow = new EntitySchema({
  name: 'TenantRow',
  tableName: 'tenant',
  schema: 'identity',
  columns: {
    id: { type: 'uuid', primary: true },
    slug: { type: 'text' },
    name: { type: 'text' },
    currency: { type: 'char', length: 3 },
    locale: { type: 'text' },
    time_zone: { type: 'text' },
    area_unit: { type: 'text' },
    created_at: { type: 'timestamptz', insert: false, update: false },
    updated_at: { type: 'timestamptz', insert: false },
    version: { type: 'int', insert: false },
  },
});
