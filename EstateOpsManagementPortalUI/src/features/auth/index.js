/** Public surface of the auth feature. */
export { default as RequireAuth } from './components/RequireAuth.jsx';
export { default as LoginForm } from './components/LoginForm.jsx';
export { default as TwoFactorForm } from './components/TwoFactorForm.jsx';
export { default as GoogleSignIn } from './components/GoogleSignIn.jsx';
export { default as UserMenu } from './components/UserMenu.jsx';
export { default as Can } from './components/Can.jsx';

export { useSessionQuery, useCurrentUser } from './hooks/useSessionQuery.js';
export { usePermission, usePermissions } from './hooks/usePermissions.js';
export { useLoginMutation } from './hooks/useLoginMutation.js';
export { useVerifyCodeMutation } from './hooks/useVerifyCodeMutation.js';
export { useGoogleLoginMutation } from './hooks/useGoogleLoginMutation.js';
export { useLogoutMutation } from './hooks/useLogoutMutation.js';

export * from './domain/auth.constants.js';
export { userShape } from './domain/auth.model.js';
