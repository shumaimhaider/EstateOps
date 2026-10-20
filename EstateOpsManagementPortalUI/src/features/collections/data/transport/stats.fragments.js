export const COLLECTIONS_STATS_FIELDS = /* GraphQL */ `
  fragment CollectionsStatsFields on CollectionsStats {
    currency
    as_of
    summary {
      total_sale_value
      received_amount
      pending_amount
      overdue_amount
      due_this_month_amount
      fine_amount
      installments_total
      installments_paid
      installments_due
      installments_overdue
      installments_upcoming
      bookings_count
      escalated_count
      units_total
      units_available
      units_booked
      units_sold
    }
    by_month {
      month
      due_amount
      collected_amount
    }
    ageing {
      bucket
      count
      amount
    }
    units_by_kind {
      kind
      total
      available
      held
      booked
      sold
      blocked
    }
    by_project {
      project_id
      project_name
      units_total
      units_sold
      sale_value
      received_amount
      pending_amount
      overdue_amount
    }
  }
`;
