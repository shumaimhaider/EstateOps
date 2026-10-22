import { EntitySchema } from 'typeorm';

export const UserRow = new EntitySchema({
  name: 'UserRow',
  tableName: 'app_user',
  schema: 'identity',
  columns: {
    id: { type: 'uuid', primary: true },
    tenant_id: { type: 'uuid' },
    email: { type: 'text' },
    name: { type: 'text' },
    role: { type: 'text' },
    password_hash: { type: 'text' },
    totp_secret: { type: 'text' },
    active: { type: 'boolean' },
    created_at: { type: 'timestamptz', insert: false, update: false },
    updated_at: { type: 'timestamptz', insert: false },
    version: { type: 'int', insert: false },
  },
});
