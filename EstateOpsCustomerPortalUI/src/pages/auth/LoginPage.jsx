import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LoginForm,
  rememberedTenant,
  useLoginMutation,
  useSessionQuery,
} from '@/features/auth/index.js';
import { config } from '@/shared/config/config.js';
import AuthLayout from './AuthLayout.jsx';

export default function LoginPage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSessionQuery();
  const login = useLoginMutation();
  if (session.data) return <Navigate to={location.state?.from ?? '/'} replace />;
  const fixed = Boolean(config.tenantSlug);
  return (
    <AuthLayout title={t('title')} intro={t('intro')}>
      <LoginForm
        tenant={config.tenantSlug || rememberedTenant()}
        tenantFixed={fixed}
        onSubmit={async (values) => {
          await login.mutateAsync(values);
          navigate(location.state?.from ?? '/', { replace: true });
        }}
      />
    </AuthLayout>
  );
}
