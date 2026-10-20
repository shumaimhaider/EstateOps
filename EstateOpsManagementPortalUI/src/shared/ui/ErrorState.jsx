import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { getErrorInfo } from '@/shared/lib/errors.js';
import Button from './Button.jsx';

/** Query failure with retry. Contract drift shows a generic message, never raw data. */
export default function ErrorState({ error, title, onRetry }) {
  const { t } = useTranslation();
  const { code } = getErrorInfo(error);
  const body =
    code === 'CONTRACT_ERROR'
      ? t('states.contractError')
      : code === 'NETWORK_ERROR'
        ? t('states.networkError')
        : t('states.errorGeneric');
  return (
    <div
      role="alert"
      className="rounded-2xl border border-tone-danger-fg/30 bg-tone-danger-bg/40 p-6"
    >
      <h2 className="text-base font-semibold">{title ?? t('states.errorTitle')}</h2>
      <p className="mt-1 text-sm text-content-muted">{body}</p>
      {onRetry && (
        <Button className="mt-4" variant="secondary" onClick={onRetry}>
          {t('actions.retry')}
        </Button>
      )}
    </div>
  );
}

ErrorState.propTypes = {
  error: PropTypes.shape({ code: PropTypes.string }),
  title: PropTypes.string,
  onRetry: PropTypes.func,
};
