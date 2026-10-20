import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { config } from '@/shared/config/config.js';
import { renderGoogleButton } from '@/shared/lib/googleIdentity.js';
import Button from '@/shared/ui/Button.jsx';
import GoogleIcon from '@/shared/ui/GoogleIcon.jsx';
import { useDevAccountsQuery } from '../hooks/useDevAccountsQuery.js';
import MockGoogleChooser from './MockGoogleChooser.jsx';

/**
 * "Continue with Google". Mock mode: our own account chooser. Real mode: Google Identity
 * Services renders its button; either way `onToken(idToken)` receives the id token to exchange.
 */
export default function GoogleSignIn({ onToken, pending = false }) {
  const { t } = useTranslation('auth');
  const [choosing, setChoosing] = useState(false);
  const accounts = useDevAccountsQuery({ enabled: config.isMock });
  const container = useRef(null);

  useEffect(() => {
    if (config.isMock || !config.googleClientId || !container.current) return;
    renderGoogleButton(container.current, {
      clientId: config.googleClientId,
      onCredential: onToken,
    }).catch(() => {});
  }, [onToken]);

  if (!config.isMock) {
    return config.googleClientId ? (
      <div ref={container} className="flex min-h-11 justify-center" />
    ) : (
      <p className="text-center text-sm text-content-muted">{t('google.notConfigured')}</p>
    );
  }

  return (
    <>
      <Button
        variant="secondary"
        className="w-full py-3"
        loading={pending}
        onClick={() => setChoosing(true)}
      >
        <GoogleIcon />
        {t('google.continue')}
      </Button>
      <MockGoogleChooser
        open={choosing}
        accounts={accounts.data ?? []}
        onClose={() => setChoosing(false)}
        onPick={(email) => {
          setChoosing(false);
          onToken(`mock-google:${email}`);
        }}
      />
    </>
  );
}

GoogleSignIn.propTypes = { onToken: PropTypes.func.isRequired, pending: PropTypes.bool };
