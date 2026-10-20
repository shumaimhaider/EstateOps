import { useTranslation } from 'react-i18next';
import {
  CustomerFilters,
  CustomersTable,
  useCustomerFilters,
  useCustomersQuery,
} from '@/features/customers/index.js';
import Card from '@/shared/ui/Card.jsx';
import EmptyState from '@/shared/ui/EmptyState.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import LoadMore from '@/shared/ui/LoadMore.jsx';
import PageHeader from '@/shared/ui/PageHeader.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';

export default function CustomersPage() {
  const { t } = useTranslation('customers');
  const { filters, setFilters } = useCustomerFilters();
  const query = useCustomersQuery(filters);
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <Card>
        <CustomerFilters filters={filters} onChange={setFilters} />
      </Card>
      {query.isPending && <Skeleton rows={8} />}
      {query.isError && (
        <ErrorState title={t('loadError')} error={query.error} onRetry={() => query.refetch()} />
      )}
      {query.isSuccess && query.customers.length === 0 && (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
      )}
      {query.isSuccess && query.customers.length > 0 && (
        <div>
          <CustomersTable
            customers={query.customers}
            sort={filters.sort}
            onSortChange={(sort) => setFilters({ sort })}
            toolbarStart={t('count', { count: query.customers.length })}
          />
          <LoadMore
            hasNextPage={query.hasNextPage}
            loading={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          />
        </div>
      )}
    </div>
  );
}
