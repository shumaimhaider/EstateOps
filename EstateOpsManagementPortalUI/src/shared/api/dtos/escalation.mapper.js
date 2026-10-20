import { money } from '../../lib/money.js';

/** @returns {import('../../../features/collections/domain/escalation.model.js').Escalation} */
export function fromApi(dto) {
  const c = dto.currency;
  return {
    id: dto.id,
    bookingId: dto.booking_id,
    unitId: dto.unit_id,
    unitNo: dto.unit_no,
    unitKind: dto.unit_kind,
    projectName: dto.project_name,
    customerId: dto.customer_id,
    buyerName: dto.buyer_name,
    buyerPhone: dto.buyer_phone,
    missedInstallments: dto.missed_installments,
    overdue: money(dto.overdue_amount, c),
    fine: money(dto.fine_amount, c),
    oldestDueDate: dto.oldest_due_date,
    daysLate: dto.days_late,
    noticeSentAt: dto.notice_sent_at,
    status: dto.status,
    allowedActions: dto.allowed_actions,
  };
}
