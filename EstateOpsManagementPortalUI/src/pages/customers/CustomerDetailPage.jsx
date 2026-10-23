import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Can, usePermission } from '@/features/auth/index.js';
import { FineRuleCategories } from '@/features/fines/index.js';
import { CustomerProfile, useCustomerQuery } from '@/features/customers/index.js';
import { PortalAccessCard } from '@/features/support/index.js';
import { SavedCardsPanel, TransactionsTable } from '@/features/payments/index.js';
import { getErrorInfo } from '@/shared/lib/errors.js';
import EmptyState from '@/shared/ui/EmptyState.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import PageHeader from '@/shared/ui/PageHeader.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import CustomerPaymentsPanel from '@/widgets/CustomerPaymentsPanel.jsx';

/** A customer: profile, money position, their units, and every invoice with Take payment. */
export default function CustomerDetailPage() {
  const { t } = useTranslation('customers');
  const { t: tp } = useTranslation('payments');
  const { customerId } = useParams();
  const query = useCustomerQuery(customerId);
  const canInspect = usePermission('payments.card');
  const canManage = usePermission('customers.manage');

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
      <Can perm="customers.view">
        <PortalAccessCard customerId={customerId} canManage={canManage} />
      </Can>
      <Can perm="fines.view">
        <FineRuleCategories scope="customer" scopeId={customerId} />
      </Can>
      <CustomerPaymentsPanel customerId={customerId} />
      <Can perm="payments.card">
        <SavedCardsPanel customerId={customerId} />
      </Can>
      <Can perm="sales.view">
        <section aria-labelledby="customer-transactions">
          <h2 id="customer-transactions" className="mb-3 text-lg font-semibold">
            {tp('transactions.title')}
          </h2>
          <TransactionsTable filters={{ customerId }} canInspect={canInspect} showFilter={false} />
        </section>
      </Can>
    </div>
  );
}
