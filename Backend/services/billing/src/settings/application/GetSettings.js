import { PERMISSION, assertCan } from '@estateops/kernel';

export class GetSettings {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor }) {
    assertCan(actor, PERMISSION.FINES_VIEW);
    return this.uow.read((repos) => repos.settings.get(actor.tenantId));
  }
}
