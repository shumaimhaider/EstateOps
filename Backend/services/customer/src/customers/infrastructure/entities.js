import { EntitySchema } from 'typeorm';

export const CustomerRow = new EntitySchema({
  name: 'CustomerRow',
  tableName: 'customer',
  schema: 'customer',
  columns: {
    id: { type: 'uuid', primary: true },
    tenant_id: { type: 'uuid' },
    full_name: { type: 'text' },
    phone: { type: 'text', nullable: true },
    email: { type: 'text', nullable: true },
    id_number: { type: 'text', nullable: true },
    city: { type: 'text', nullable: true },
    preferred_language: { type: 'text' },
    created_at: { type: 'timestamptz', insert: false, update: false },
    updated_at: { type: 'timestamptz', insert: false },
    version: { type: 'int', insert: false },
  },
});
