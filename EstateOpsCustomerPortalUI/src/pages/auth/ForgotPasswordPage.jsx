import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ForgotPasswordForm,
  rememberedTenant,
  useForgotPasswordMutation,
} from '@/features/auth/index.js';
import { config } from '@/shared/config/config.js';
import AuthLayout from './AuthLayout.jsx';

export default function ForgotPasswordPage() {
  const { t } = useTranslation('auth');
  const forgot = useForgotPasswordMutation();
  const [sentTo, setSentTo] = useState('');
  return (
    <AuthLayout title={t('forgotTitle')} intro={sentTo ? undefined : t('forgotIntro')}>
      {sentTo ? (
        <>
          <p role="status" className="rounded-xl bg-surface-muted p-3 text-sm">
            {t('forgotDone')}
          </p>
        </>
      ) : (
        <ForgotPasswordForm
          tenant={config.tenantSlug || rememberedTenant()}
          tenantFixed={Boolean(config.tenantSlug)}
          onSubmit={async (values) => {
            await forgot.mutateAsync(values);
            setSentTo(values.email);
          }}
        />
      )}
      <p className="mt-4 text-center text-sm">
        <Link className="text-primary underline" to="/login">
          {t('backToSignIn')}
        </Link>
      </p>
    </AuthLayout>
  );
}
