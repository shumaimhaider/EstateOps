/**
 * GraphQL fragments for units, defined once and reused by every document.
 * Selects the same field names as the REST DTO so the same schema parses both.
 */
export const UNIT_FIELDS = /* GraphQL */ `
  fragment UnitFields on Unit {
    id
    tenant_id
    project_id
    project_name
    phase_id
    block_id
    block_name
    floor_id
    floor_label
    unit_no
    kind
    area_value
    area_unit
    bedrooms
    facing
    view
    corner
    parking
    attributes
    status
    list_price
    currency
    geometry
    allowed_actions
    booking_id
    created_at
    updated_at
    created_by
  }
`;

export const UNIT_DETAIL_FIELDS = /* GraphQL */ `
  fragment UnitDetailFields on Unit {
    ...UnitFields
    media {
      id
      kind
      url
      caption
    }
    status_history {
      status
      changed_by
      changed_by_name
      changed_at
    }
  }
  ${UNIT_FIELDS}
`;
