import { useTranslation } from 'react-i18next';
import {
  UnitActions,
  UnitDetailPanel,
  useUnitActionHandler,
  useUnitQuery,
} from '@/features/inventory/index.js';
import { useParams } from 'react-router-dom';
import { getErrorInfo } from '@/shared/lib/errors.js';
import EmptyState from '@/shared/ui/EmptyState.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import PageHeader from '@/shared/ui/PageHeader.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import BookingPaymentsPanel from '@/widgets/BookingPaymentsPanel.jsx';

/** A unit: pictures (flats, shops, villas), details, history and, once sold, its EMI schedule. */
export default function UnitDetailPage() {
  const { t } = useTranslation('inventory');
  const { unitId } = useParams();
  const query = useUnitQuery(unitId);
  const unitAction = useUnitActionHandler();

  if (query.isPending) return <Skeleton rows={6} />;
  if (query.isError) {
    return getErrorInfo(query.error).status === 404 ? (
      <EmptyState title={t('detail.notFound')} />
    ) : (
      <ErrorState error={query.error} onRetry={() => query.refetch()} />
    );
  }

  const unit = query.data;
  return (
    <div className="space-y-8">
      <PageHeader
        backTo={`/inventory/units?project=${unit.projectId}`}
        backLabel={t('detail.back')}
        title={t('detail.title', { unitNo: unit.unitNo })}
        description={unit.projectName}
        actions={
          <UnitActions
            unit={unit}
            onAction={unitAction.handleAction}
            pending={unitAction.isPending}
          />
        }
      />
      <UnitDetailPanel unit={unit} />
      {unit.bookingId && (
        <section aria-labelledby="unit-sale">
          <h2 id="unit-sale" className="mb-4 text-xl font-bold">
            {t('detail.saleAndEmi')}
          </h2>
          <BookingPaymentsPanel bookingId={unit.bookingId} />
        </section>
      )}
    </div>
  );
}
