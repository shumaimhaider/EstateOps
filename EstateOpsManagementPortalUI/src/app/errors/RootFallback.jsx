import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import Button from '@/shared/ui/Button.jsx';

/** Last-resort fallback for error boundaries. */
export default function RootFallback({ resetErrorBoundary }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-8 shadow-token"
    >
      <h1 className="text-xl font-semibold">{t('states.errorTitle')}</h1>
      <p className="mt-2 text-sm text-content-muted">{t('states.errorGeneric')}</p>
      <Button className="mt-4" onClick={resetErrorBoundary}>
        {t('actions.retry')}
      </Button>
    </div>
  );
}

RootFallback.propTypes = { resetErrorBoundary: PropTypes.func.isRequired };
