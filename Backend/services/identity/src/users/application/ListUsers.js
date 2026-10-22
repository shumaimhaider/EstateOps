import { PERMISSION, assertCan } from '@estateops/kernel';

export class ListUsers {
  constructor({ uow }) {
    this.uow = uow;
  }

  /** input: { actor, q, role, cursor, limit } -> { items, nextCursor } */
  async execute({ actor, q, role, cursor, limit }) {
    assertCan(actor, PERMISSION.PERMISSIONS_MANAGE);
    return this.uow.read((repos) =>
      repos.users.list(actor.tenantId, {
        q: q?.trim() || undefined,
        role: role || undefined,
        cursor,
        limit,
      }),
    );
  }
}
