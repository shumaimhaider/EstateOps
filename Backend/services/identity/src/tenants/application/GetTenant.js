import { NotFoundError } from '@estateops/kernel';

export class GetTenant {
  constructor({ uow }) {
    this.uow = uow;
  }

  /** input: { actor } -> the actor's own tenant. */
  async execute({ actor }) {
    return this.uow.read(async (repos) => {
      const tenant = await repos.tenants.findById(actor.tenantId);
      if (!tenant) throw new NotFoundError('Tenant not found');
      return tenant;
    });
  }
}
