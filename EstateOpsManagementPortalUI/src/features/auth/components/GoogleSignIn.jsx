import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { config } from '@/shared/config/config.js';
import { renderGoogleButton } from '@/shared/lib/googleIdentity.js';

/**
 * "Continue with Google": Google Identity Services renders its button and `onToken(idToken)`
 * receives the id token to exchange. Without a client id the option is explained, not shown.
 */
export default function GoogleSignIn({ onToken }) {
  const { t } = useTranslation('auth');
  const container = useRef(null);

  useEffect(() => {
    if (!config.googleClientId || !container.current) return;
    renderGoogleButton(container.current, {
      clientId: config.googleClientId,
      onCredential: onToken,
    }).catch(() => {});
  }, [onToken]);

  return config.googleClientId ? (
    <div ref={container} className="flex min-h-11 justify-center" />
  ) : (
    <p className="text-center text-sm text-content-muted">{t('google.notConfigured')}</p>
  );
}

GoogleSignIn.propTypes = { onToken: PropTypes.func.isRequired };
