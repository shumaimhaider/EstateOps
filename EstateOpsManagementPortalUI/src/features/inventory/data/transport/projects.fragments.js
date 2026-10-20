export const PROJECT_FIELDS = /* GraphQL */ `
  fragment ProjectFields on Project {
    id
    tenant_id
    name
    location
    kind
    units_total
    unit_counts
    allowed_actions
    created_at
    updated_at
    created_by
  }
`;

export const PROJECT_MAP_FIELDS = /* GraphQL */ `
  fragment ProjectMapFields on ProjectMap {
    project_id
    project_name
    width
    height
    blocks {
      id
      name
      kind
      x
      y
      w
      h
    }
    shapes {
      unit_id
      unit_no
      block_id
      kind
      status
      x
      y
      w
      h
    }
  }
`;
