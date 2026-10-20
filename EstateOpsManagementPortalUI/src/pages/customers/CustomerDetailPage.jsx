import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CustomerProfile, useCustomerQuery } from '@/features/customers/index.js';
import { getErrorInfo } from '@/shared/lib/errors.js';
import EmptyState from '@/shared/ui/EmptyState.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import PageHeader from '@/shared/ui/PageHeader.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import CustomerPaymentsPanel from '@/widgets/CustomerPaymentsPanel.jsx';

/** A customer: profile, money position, their units, and every invoice with Take payment. */
export default function CustomerDetailPage() {
  const { t } = useTranslation('customers');
  const { customerId } = useParams();
  const query = useCustomerQuery(customerId);

  if (query.isPending) return <Skeleton rows={6} />;
  if (query.isError) {
    return getErrorInfo(query.error).status === 404 ? (
      <EmptyState title={t('detail.notFound')} />
    ) : (
      <ErrorState error={query.error} onRetry={() => query.refetch()} />
    );
  }
  return (
    <div className="space-y-8">
      <PageHeader backTo="/customers" backLabel={t('detail.back')} title={query.data.fullName} />
      <CustomerProfile customer={query.data} />
      <CustomerPaymentsPanel customerId={customerId} />
    </div>
  );
}
