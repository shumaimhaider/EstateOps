import { graphqlClient } from '@/shared/api/graphqlClient.js';
import { SESSION_FIELDS, USER_FIELDS } from './auth.fragments.js';

const LOGIN = /* GraphQL */ `
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      status
      mfa_token
    }
  }
`;
const VERIFY = /* GraphQL */ `
  mutation Verify2fa($input: Verify2faInput!) {
    verify2fa(input: $input) {
      ...SessionFields
    }
  }
  ${SESSION_FIELDS}
`;
const GOOGLE = /* GraphQL */ `
  mutation GoogleLogin($input: GoogleLoginInput!) {
    googleLogin(input: $input) {
      ...SessionFields
    }
  }
  ${SESSION_FIELDS}
`;
const REFRESH = /* GraphQL */ `
  mutation RefreshToken($input: RefreshInput!) {
    refreshToken(input: $input) {
      access_token
      refresh_token
    }
  }
`;
const LOGOUT = /* GraphQL */ `
  mutation Logout {
    logout {
      ok
    }
  }
`;
const ME = /* GraphQL */ `
  query Me {
    me {
      ...UserFields
    }
  }
  ${USER_FIELDS}
`;

export const authGraphql = {
  login: async (input) => (await graphqlClient.mutate(LOGIN, { input })).login,
  verify: async (input) => (await graphqlClient.mutate(VERIFY, { input })).verify2fa,
  google: async (input) => (await graphqlClient.mutate(GOOGLE, { input })).googleLogin,
  refresh: async (input) => (await graphqlClient.mutate(REFRESH, { input })).refreshToken,
  logout: async () => (await graphqlClient.mutate(LOGOUT, {})).logout,
  me: async ({ signal } = {}) => (await graphqlClient.query(ME, undefined, { signal })).me,
};
