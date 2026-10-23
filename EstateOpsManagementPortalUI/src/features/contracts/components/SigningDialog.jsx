import { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import Button from '@/shared/ui/Button.jsx';
import Dialog from '@/shared/ui/Dialog.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import { contractShape } from '../domain/contract.model.js';
import RealSigningFrame from './RealSigningFrame.jsx';

/**
 * The buyer signs on this screen. `session` is the embedded signing session (null while it is
 * being opened). `onEvent('completed'|'declined')` reports what the signer did; once told, the
 * dialog shows the outcome while the contract list catches up with PandaDoc's confirmation.
 */
export default function SigningDialog({ contract, session, loading, error, onEvent, onClose }) {
  const { t } = useTranslation('contracts');
  const [outcome, setOutcome] = useState(null);
  const report = useCallback(
    async (event) => {
      setOutcome(event);
      await onEvent(event);
    },
    [onEvent],
  );

  return (
    <Dialog
      open={Boolean(contract)}
      onClose={onClose}
      title={contract ? t('signing.title', { title: contract.title }) : ''}
    >
      {contract && (
        <div className="space-y-4">
          <p className="text-sm text-content-muted">
            {t('signing.hint', { email: contract.signerEmail })}
          </p>
          {loading && (
            <div role="status">
              <span className="sr-only">{t('signing.loading')}</span>
              <Skeleton rows={3} />
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {t('signing.failed', { message: error.message })}
            </p>
          )}
          {session && !outcome && <RealSigningFrame url={session.url} onEvent={report} />}
          {outcome && (
            <p role="status" className="rounded-xl bg-surface-muted p-3 text-sm">
              {outcome === 'completed' ? t('signing.signed') : t('signing.declined')}
            </p>
          )}
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              {t('signing.close')}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

SigningDialog.propTypes = {
  contract: contractShape,
  session: PropTypes.shape({ url: PropTypes.string.isRequired }),
  loading: PropTypes.bool,
  error: PropTypes.shape({ message: PropTypes.string }),
  onEvent: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
