import { PERMISSION, assertCan, daysBetween, today as todayOf } from '@estateops/kernel';

/** Escalated cases: bookings with the threshold number of overdue installments, longest overdue first. */
export class ListEscalations {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, cursor, limit }) {
    assertCan(actor, PERMISSION.ESCALATIONS_VIEW);
    const today = todayOf(this.clock);
    return this.uow.read(async (repos) => {
      const settings = await repos.settings.get(actor.tenantId);
      const page = await repos.escalations.list(actor.tenantId, settings.escalationMissed, {
        cursor,
        limit,
      });
      return {
        nextCursor: page.nextCursor,
        items: page.items.map((e) => ({
          ...e,
          daysLate: daysBetween(e.oldestDueDate, today),
          status: e.noticeSentAt ? 'notice_sent' : 'open',
          allowedActions:
            !e.noticeSentAt && actor.permissions.includes(PERMISSION.PAYMENTS_RECORD)
              ? ['send_notice']
              : [],
        })),
      };
    });
  }
}
