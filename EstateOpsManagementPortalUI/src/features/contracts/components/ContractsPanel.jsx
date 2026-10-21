import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { FilePlus2, Upload } from 'lucide-react';
import Button from '@/shared/ui/Button.jsx';
import ConfirmDialog from '@/shared/ui/ConfirmDialog.jsx';
import EmptyState from '@/shared/ui/EmptyState.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import { canStartContract, hasSignedContract } from '../domain/contract.rules.js';
import { useContractsController } from '../hooks/useContractsController.js';
import { useContractsQuery } from '../hooks/useContractsQuery.js';
import ContractCard from './ContractCard.jsx';
import CreateContractDialog from './CreateContractDialog.jsx';
import ReviseContractDialog from './ReviseContractDialog.jsx';
import UploadContractDialog from './UploadContractDialog.jsx';

/**
 * A booking's contracts: upload the signed copy, or draft, send and revise one in PandaDoc.
 * `canManage` shows the create/upload buttons; each contract's own actions come from the server.
 */
export default function ContractsPanel({ bookingId, canManage = false }) {
  const { t } = useTranslation('contracts');
  const query = useContractsQuery(bookingId);
  const c = useContractsController(bookingId);
  const contracts = query.data ?? [];
  const signed = hasSignedContract(contracts);

  return (
    <section aria-labelledby="booking-contracts" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="booking-contracts" className="text-lg font-semibold">
            {t('title')}
          </h2>
          <p className="text-sm text-content-muted">{t('subtitle')}</p>
        </div>
        {canManage && query.isSuccess && !signed && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={c.openUpload}>
              <Upload aria-hidden="true" className="size-4" />
              {t('upload.open')}
            </Button>
            {canStartContract(contracts) && (
              <Button onClick={c.openCreate}>
                <FilePlus2 aria-hidden="true" className="size-4" />
                {t('create.open')}
              </Button>
            )}
          </div>
        )}
      </div>
      {query.isPending && <Skeleton rows={3} />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.isSuccess && contracts.length === 0 && (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
      )}
      {contracts.length > 0 && (
        <ul className="space-y-3">
          {contracts.map((contract) => (
            <ContractCard
              key={contract.id}
              contract={contract}
              busy={c.busy}
              onAction={c.onAction}
              onSimulate={c.onSimulate}
            />
          ))}
        </ul>
      )}
      <UploadContractDialog
        open={c.dialog?.type === 'upload'}
        onClose={c.close}
        onSubmit={c.onUpload}
      />
      <CreateContractDialog
        open={c.dialog?.type === 'create'}
        pending={c.creating}
        onClose={c.close}
        onSubmit={c.onCreate}
      />
      <ReviseContractDialog
        contract={c.dialog?.type === 'revise' ? c.dialog.contract : undefined}
        onClose={c.close}
        onSubmit={c.onRevise}
      />
      <ConfirmDialog
        open={c.dialog?.type === 'void'}
        title={t('void.title')}
        message={t('void.message', { title: c.dialog?.contract?.title ?? '' })}
        confirmLabel={t('actions.void')}
        danger
        pending={c.busy}
        onCancel={c.close}
        onConfirm={() => c.onVoid(c.dialog.contract)}
      />
    </section>
  );
}

ContractsPanel.propTypes = { bookingId: PropTypes.string.isRequired, canManage: PropTypes.bool };
