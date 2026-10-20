export const ESCALATION_FIELDS = /* GraphQL */ `
  fragment EscalationFields on Escalation {
    id
    tenant_id
    booking_id
    unit_id
    unit_no
    unit_kind
    project_name
    customer_id
    buyer_name
    buyer_phone
    currency
    missed_installments
    overdue_amount
    fine_amount
    oldest_due_date
    days_late
    notice_sent_at
    status
    allowed_actions
    created_at
    updated_at
    created_by
  }
`;
