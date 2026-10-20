import { useTranslation } from 'react-i18next';
import {
  BookingFilters,
  BookingsTable,
  useBookingFilters,
  useBookingsQuery,
} from '@/features/sales/index.js';
import { useProjectsQuery } from '@/features/inventory/index.js';
import Card from '@/shared/ui/Card.jsx';
import EmptyState from '@/shared/ui/EmptyState.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import LoadMore from '@/shared/ui/LoadMore.jsx';
import PageHeader from '@/shared/ui/PageHeader.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';

/** Every booked or sold unit with its EMI position: sale price, received, pending, installments. */
export default function SalesPage() {
  const { t } = useTranslation('sales');
  const { filters, setFilters } = useBookingFilters();
  const query = useBookingsQuery(filters);
  const projects = useProjectsQuery();

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <Card>
        <BookingFilters filters={filters} projects={projects.data ?? []} onChange={setFilters} />
      </Card>
      {query.isPending && <Skeleton rows={8} />}
      {query.isError && (
        <ErrorState title={t('loadError')} error={query.error} onRetry={() => query.refetch()} />
      )}
      {query.isSuccess && query.bookings.length === 0 && (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
      )}
      {query.isSuccess && query.bookings.length > 0 && (
        <div>
          <BookingsTable
            bookings={query.bookings}
            sort={filters.sort}
            onSortChange={(sort) => setFilters({ sort })}
            toolbarStart={t('count', { count: query.bookings.length })}
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
