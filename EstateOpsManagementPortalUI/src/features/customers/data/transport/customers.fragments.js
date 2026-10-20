export const CUSTOMER_FIELDS = /* GraphQL */ `
  fragment CustomerFields on Customer {
    id
    tenant_id
    full_name
    phone
    email
    id_number_masked
    city
    preferred_language
    currency
    bookings_count
    units_summary
    total_value
    received_amount
    pending_amount
    overdue_amount
    escalated_count
    allowed_actions
    created_at
    updated_at
  }
`;
