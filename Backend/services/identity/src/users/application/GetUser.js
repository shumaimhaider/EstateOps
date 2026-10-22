import { NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';

export class GetUser {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.PERMISSIONS_MANAGE);
    return this.uow.read(async (repos) => {
      const user = await repos.users.findById(actor.tenantId, id);
      if (!user) throw new NotFoundError('User not found');
      return user;
    });
  }
}
