import { NotFoundError } from '@estateops/kernel';

/** The signed-in person with their tenant. Permissions come from the token the person holds. */
export class GetMe {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor }) {
    return this.uow.read(async (repos) => {
      const user = await repos.users.findById(actor.tenantId, actor.userId);
      if (!user || !user.active) throw new NotFoundError('User not found');
      const tenant = await repos.tenants.findById(user.tenantId);
      return { user: { ...user, permissions: actor.permissions }, tenant };
    });
  }
}
