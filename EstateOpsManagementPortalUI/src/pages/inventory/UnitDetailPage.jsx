import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  UnitActions,
  KINDS_WITH_PICTURES,
  UnitDetailPanel,
  UnitPicturesManager,
  useUnitActionHandler,
  useUnitQuery,
} from '@/features/inventory/index.js';
import { useNavigate, useParams } from 'react-router-dom';
import { Can } from '@/features/auth/index.js';
import { FineRuleCard } from '@/features/fines/index.js';
import { NewBookingDialog } from '@/features/sales/index.js';
import Button from '@/shared/ui/Button.jsx';
import { useToast } from '@/shared/ui/toast/toastContext.js';
import { getErrorInfo } from '@/shared/lib/errors.js';
import EmptyState from '@/shared/ui/EmptyState.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import PageHeader from '@/shared/ui/PageHeader.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import BookingPaymentsPanel from '@/widgets/BookingPaymentsPanel.jsx';

/** A unit: pictures (flats, shops, villas), details, history and, once sold, its EMI schedule. */
export default function UnitDetailPage() {
  const { t } = useTranslation('inventory');
  const { t: ts } = useTranslation('sales');
  const { unitId } = useParams();
  const query = useUnitQuery(unitId);
  const unitAction = useUnitActionHandler();
  const navigate = useNavigate();
  const toast = useToast();
  const [booking, setBooking] = useState(false);

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
          <div className="flex flex-wrap items-center gap-2">
            {unit.status === 'available' && (
              <Can perm="sales.manage">
                <Button onClick={() => setBooking(true)}>{ts('new.bookThisUnit')}</Button>
              </Can>
            )}
            <UnitActions
              unit={unit}
              onAction={unitAction.handleAction}
              pending={unitAction.isPending}
            />
          </div>
        }
      />
      <NewBookingDialog
        open={booking}
        unit={unit}
        onClose={() => setBooking(false)}
        onCreated={(created) => {
          setBooking(false);
          toast.show({ tone: 'success', message: ts('new.accepted') });
          navigate(`/sales/${created.id}`);
        }}
      />
      <UnitDetailPanel unit={unit} />
      {KINDS_WITH_PICTURES.includes(unit.kind) && (
        <Can perm="inventory.manage">
          <UnitPicturesManager unit={unit} />
        </Can>
      )}
      <Can perm="fines.view">
        <FineRuleCard scope="unit" scopeId={unit.id} />
      </Can>
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
