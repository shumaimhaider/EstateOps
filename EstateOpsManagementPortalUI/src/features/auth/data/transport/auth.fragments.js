export const USER_FIELDS = /* GraphQL */ `
  fragment UserFields on User {
    id
    name
    email
    role
    tenant {
      id
      slug
      name
      currency
      locale
      time_zone
      area_unit
    }
  }
`;

export const SESSION_FIELDS = /* GraphQL */ `
  fragment SessionFields on Session {
    access_token
    refresh_token
    user {
      ...UserFields
    }
  }
  ${USER_FIELDS}
`;
