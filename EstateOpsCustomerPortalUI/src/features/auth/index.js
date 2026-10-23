/** Public surface of the auth feature (customer sign-in, passwords and the session). */
export { default as RequireAuth } from './components/RequireAuth.jsx';
export { default as LoginForm } from './components/LoginForm.jsx';
export { default as ForgotPasswordForm } from './components/ForgotPasswordForm.jsx';
export { default as SetPasswordForm } from './components/SetPasswordForm.jsx';
export { default as ChangePasswordForm } from './components/ChangePasswordForm.jsx';

export {
  useSessionQuery,
  useCurrentCustomer,
  useLoginMutation,
  useLogoutMutation,
  useForgotPasswordMutation,
  useSetPasswordMutation,
  useChangePasswordMutation,
  useProfileQuery,
} from './hooks/auth.hooks.js';
export * from './domain/auth.constants.js';
export { customerShape } from './domain/auth.model.js';
