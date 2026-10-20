import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EscalationsTable,
  useEscalationsQuery,
  useSendNoticeMutation,
} from '@/features/collections/index.js';
import { getErrorInfo } from '@/shared/lib/errors.js';
import { formatMoney } from '@/shared/lib/money.js';
import { useTenant } from '@/shared/lib/tenant.jsx';
import Button from '@/shared/ui/Button.jsx';
import ConfirmDialog from '@/shared/ui/ConfirmDialog.jsx';
import EmptyState from '@/shared/ui/EmptyState.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import { useToast } from '@/shared/ui/toast/toastContext.js';

/** Escalated cases: bookings that have missed N or more installments. */
export default function EscalationsPage() {
  const { t } = useTranslation('collections');
  const { locale } = useTenant();
  const toast = useToast();
  const query = useEscalationsQuery();
  const sendNotice = useSendNoticeMutation();
  const [target, setTarget] = useState(null);

  const confirm = async () => {
    try {
      await sendNotice.mutateAsync(target.id);
      toast.show({
        tone: 'success',
        message: t('escalations.noticeDone', { buyer: target.buyerName }),
      });
    } catch (error) {
      toast.show({
        tone: 'danger',
        message: t('escalations.noticeFailed', { message: getErrorInfo(error).message }),
      });
    } finally {
      setTarget(null);
    }
  };

  if (query.isPending) return <Skeleton rows={6} />;
  if (query.isError) {
    return (
      <ErrorState
        title={t('escalations.loadError')}
        error={query.error}
        onRetry={() => query.refetch()}
      />
    );
  }
  if (query.escalations.length === 0) {
    return <EmptyState title={t('escalations.emptyTitle')} body={t('escalations.emptyBody')} />;
  }

  return (
    <div className="space-y-4">
      <EscalationsTable
        escalations={query.escalations}
        onSendNotice={setTarget}
        pendingId={sendNotice.isPending ? target?.id : undefined}
        toolbarStart={t('escalations.count', { count: query.escalations.length })}
      />
      {query.hasNextPage && (
        <div className="text-center">
          <Button
            variant="secondary"
            loading={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {t('actions.loadMore', { ns: 'common' })}
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(target)}
        title={t('escalations.confirmTitle')}
        message={
          target
            ? t('escalations.confirmMessage', {
                buyer: target.buyerName,
                count: target.missedInstallments,
                amount: formatMoney(target.overdue.minor, target.overdue.currency, locale),
              })
            : ''
        }
        confirmLabel={t('escalations.sendNotice')}
        pending={sendNotice.isPending}
        onCancel={() => setTarget(null)}
        onConfirm={confirm}
      />
    </div>
  );
}
