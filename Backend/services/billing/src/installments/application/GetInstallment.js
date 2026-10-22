import { NotFoundError, PERMISSION, assertCan, today as todayOf } from '@estateops/kernel';
import { toRegisterRow } from './ListInstallments.js';

export class GetInstallment {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.SALES_VIEW);
    const view = await this.uow.read((repos) => repos.installments.findView(actor.tenantId, id));
    if (!view) throw new NotFoundError('Invoice not found');
    return toRegisterRow(view, actor, todayOf(this.clock));
  }
}
