import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SetPasswordForm, useSetPasswordMutation } from '@/features/auth/index.js';
import AuthLayout from './AuthLayout.jsx';

/** Opened from the invitation (`invite`) or the reset (`reset`) email; the token is in the link. */
export default function SetPasswordPage({ mode }) {
  const { t } = useTranslation('auth');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const setPassword = useSetPasswordMutation();
  const [done, setDone] = useState(false);
  const title = mode === 'invite' ? t('setTitle') : t('resetTitle');
  return (
    <AuthLayout title={title} intro={done || !token ? undefined : t('setIntro')}>
      {!token && (
        <p role="alert" className="text-sm text-danger">
          {t('linkMissing')}
        </p>
      )}
      {token && !done && (
        <SetPasswordForm
          submitLabel={t('setSubmit')}
          onSubmit={async ({ password }) => {
            await setPassword.mutateAsync({ token, password });
            setDone(true);
          }}
        />
      )}
      {done && (
        <p role="status" className="rounded-xl bg-surface-muted p-3 text-sm">
          {t('setDone')}
        </p>
      )}
      <p className="mt-4 text-center text-sm">
        <Link className="text-primary underline" to="/login">
          {t('backToSignIn')}
        </Link>
      </p>
    </AuthLayout>
  );
}
SetPasswordPage.propTypes = { mode: PropTypes.oneOf(['invite', 'reset']).isRequired };
