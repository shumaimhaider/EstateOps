import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

/** What PandaDoc's embedded page tells its parent window, mapped to our two outcomes. */
const MESSAGES = {
  'session_view.document.completed': 'completed',
  'session_view.document.exception': 'declined',
};

/**
 * PandaDoc's embedded signing page in an iframe. Only messages from the page's own origin count,
 * so no other page can claim the buyer signed (the webhook is what finally decides).
 */
export default function RealSigningFrame({ url, onEvent }) {
  const { t } = useTranslation('contracts');
  useEffect(() => {
    const origin = new URL(url).origin;
    const listen = (message) => {
      if (message.origin !== origin) return;
      const type = typeof message.data === 'string' ? safeType(message.data) : message.data?.type;
      const event = MESSAGES[type];
      if (event) onEvent(event);
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, [url, onEvent]);

  return (
    <iframe
      title={t('signing.frameTitle')}
      src={url}
      className="h-[70vh] w-full rounded-xl border border-border"
      allow="clipboard-write"
    />
  );
}

function safeType(text) {
  try {
    return JSON.parse(text)?.type;
  } catch {
    return undefined;
  }
}

RealSigningFrame.propTypes = {
  url: PropTypes.string.isRequired,
  onEvent: PropTypes.func.isRequired,
};
