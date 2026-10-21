import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Can, usePermission } from '@/features/auth/index.js';
import { ContractsPanel } from '@/features/contracts/index.js';
import { useBookingQuery } from '@/features/sales/index.js';
import PageHeader from '@/shared/ui/PageHeader.jsx';
import BookingPaymentsPanel from '@/widgets/BookingPaymentsPanel.jsx';

/** One property's sale and its invoices. Back goes to the customer who owns it. */
export default function BookingDetailPage() {
  const { t } = useTranslation('sales');
  const { bookingId } = useParams();
  const booking = useBookingQuery(bookingId);
  const owner = booking.data;
  const canManageContracts = usePermission('contracts.manage');
  return (
    <div>
      <PageHeader
        backTo={owner ? `/customers/${owner.customerId}` : '/customers'}
        backLabel={owner ? t('detail.backToCustomer', { name: owner.buyerName }) : t('detail.back')}
        title={owner ? t('detail.title', { unitNo: owner.unitNo }) : t('title')}
        description={owner ? `${owner.projectName} · ${owner.buyerName}` : undefined}
      />
      <div className="space-y-8">
        <BookingPaymentsPanel bookingId={bookingId} />
        <Can perm="contracts.view">
          <ContractsPanel bookingId={bookingId} canManage={canManageContracts} />
        </Can>
      </div>
    </div>
  );
}
