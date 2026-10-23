import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Button from '@/shared/ui/Button.jsx';
import Dialog from '@/shared/ui/Dialog.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import { getErrorInfo } from '@/shared/lib/errors.js';
import { contractShape } from '../domain/contract.model.js';
import { contractKeys, useStartSigningMutation } from '../hooks/contracts.hooks.js';
import RealSigningFrame from './RealSigningFrame.jsx';

/** The customer signs here, on PandaDoc's own page (embedded). Opens the session when shown. */
export default function SigningDialog({ contract, bookingId, onClose }) {
  const { t } = useTranslation('contracts');
  const queryClient = useQueryClient();
  const start = useStartSigningMutation();
  const [session, setSession] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const opened = useRef(null);

  useEffect(() => {
    if (!contract || opened.current === contract.id) return;
    opened.current = contract.id;
    setSession(null);
    setOutcome(null);
    start.mutateAsync(contract.id).then(setSession, () => {});
  }, [contract, start]);

  // What the signer did reaches us twice: at once from the signing page, and for real from
  // PandaDoc's webhook a moment later, so the list is refreshed a few times to catch the second.
  const report = useCallback(
    (event) => {
      setOutcome(event);
      const refresh = () =>
        queryClient.invalidateQueries({ queryKey: contractKeys.list(bookingId) });
      refresh();
      for (const wait of [1500, 4000, 9000]) setTimeout(refresh, wait);
    },
    [queryClient, bookingId],
  );

  return (
    <Dialog
      open={Boolean(contract)}
      onClose={onClose}
      title={contract ? t('signing.title', { title: contract.title }) : ''}
    >
      {contract && (
        <div className="space-y-4">
          <p className="text-sm text-content-muted">{t('signing.hint')}</p>
          {start.isPending && (
            <div role="status">
              <span className="sr-only">{t('signing.loading')}</span>
              <Skeleton rows={3} />
            </div>
          )}
          {start.isError && (
            <p role="alert" className="text-sm text-danger">
              {t('signing.failed', { message: getErrorInfo(start.error).message })}
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
              {outcome ? t('signing.done') : t('signing.close')}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
SigningDialog.propTypes = {
  contract: contractShape,
  bookingId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};
