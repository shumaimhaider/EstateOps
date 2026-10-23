import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Download, FileSignature } from 'lucide-react';
import Button from '@/shared/ui/Button.jsx';
import DateTime from '@/shared/ui/DateTime.jsx';
import EmptyState from '@/shared/ui/EmptyState.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import StatusPill from '@/shared/ui/StatusPill.jsx';
import { useToast } from '@/shared/ui/toast/toastContext.js';
import { useContractsQuery, useDownloadContractMutation } from '../hooks/contracts.hooks.js';
import SigningDialog from './SigningDialog.jsx';

const TONE = { sent: 'info', viewed: 'info', signed: 'success', declined: 'danger' };

/** Contracts of one property: sign the ones waiting for the customer, download the signed ones. */
export default function ContractsList({ bookingId }) {
  const { t } = useTranslation('contracts');
  const toast = useToast();
  const query = useContractsQuery(bookingId);
  const download = useDownloadContractMutation();
  const [signing, setSigning] = useState(null);

  if (query.isPending) return <Skeleton rows={2} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.data.length === 0) return <EmptyState title={t('empty')} />;

  const save = (contract) =>
    download.mutate(contract, {
      onError: () => toast.show({ tone: 'danger', message: t('downloadFailed') }),
    });
  return (
    <>
      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
        {query.data.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium">
                {c.title} <span className="text-xs text-content-muted">v{c.version}</span>
              </p>
              <p className="text-xs text-content-muted">
                {c.signedAt ? (
                  <>
                    {t('signedOn')} <DateTime iso={c.signedAt} />
                  </>
                ) : c.sentAt ? (
                  <>
                    {t('sentOn')} <DateTime iso={c.sentAt} />
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill label={t(`status.${c.status}`)} tone={TONE[c.status]} />
              {c.canSign && (
                <Button onClick={() => setSigning(c)}>
                  <FileSignature aria-hidden className="size-4" /> {t('sign')}
                </Button>
              )}
              {c.canDownload && (
                <Button
                  variant="secondary"
                  onClick={() => save(c)}
                  aria-label={t('download', { title: c.title })}
                >
                  <Download aria-hidden className="size-4" /> {t('downloadShort')}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <SigningDialog contract={signing} bookingId={bookingId} onClose={() => setSigning(null)} />
    </>
  );
}
ContractsList.propTypes = { bookingId: PropTypes.string.isRequired };
