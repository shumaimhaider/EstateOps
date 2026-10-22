import {
  NotFoundError,
  PERMISSION,
  assertCan,
  daysBetween,
  nowIso,
  today as todayOf,
} from '@estateops/kernel';
import { assertCanSendNotice } from '../domain/escalation.js';

/** Sends the one notice letter of an escalated case. Needs payments.record. input: { actor, bookingId } */
export class SendNotice {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, bookingId }) {
    assertCan(actor, PERMISSION.PAYMENTS_RECORD);
    return this.uow.run(async (repos) => {
      if (!(await repos.bookingRefs.findById(actor.tenantId, bookingId)))
        throw new NotFoundError('Escalated case not found');
      const settings = await repos.settings.get(actor.tenantId);
      const current = await repos.escalations.findOne(
        actor.tenantId,
        bookingId,
        settings.escalationMissed,
      );
      assertCanSendNotice({
        overdueCount: current?.missedInstallments ?? 0,
        threshold: settings.escalationMissed,
        noticeSent: Boolean(current?.noticeSentAt),
      });
      const sentAt = nowIso(this.clock);
      await repos.escalations.insertNotice({
        tenantId: actor.tenantId,
        bookingId,
        sentAt,
        sentBy: actor.userId,
        sentByName: actor.name,
      });
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'escalation.send_notice',
        subjectType: 'booking',
        subjectId: bookingId,
        before: { status: 'open' },
        after: { status: 'notice_sent', sentAt },
      });
      const updated = await repos.escalations.findOne(
        actor.tenantId,
        bookingId,
        settings.escalationMissed,
      );
      return {
        ...updated,
        daysLate: daysBetween(updated.oldestDueDate, todayOf(this.clock)),
        status: 'notice_sent',
        allowedActions: [],
      };
    });
  }
}
