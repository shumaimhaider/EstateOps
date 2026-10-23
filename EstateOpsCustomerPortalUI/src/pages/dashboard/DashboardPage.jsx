import { useTranslation } from 'react-i18next';
import { useCurrentCustomer } from '@/features/auth/index.js';
import { PortfolioSummary, PropertyCard, usePropertiesQuery } from '@/features/properties/index.js';
import EmptyState from '@/shared/ui/EmptyState.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import PageHeader from '@/shared/ui/PageHeader.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';

export default function DashboardPage() {
  const { t } = useTranslation();
  const customer = useCurrentCustomer();
  const query = usePropertiesQuery();
  return (
    <>
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.welcome', { name: customer?.name })}
      />
      {query.isPending && <Skeleton rows={4} />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.data?.length === 0 && (
        <EmptyState title={t('dashboard.none', { developer: customer?.tenant.name })} />
      )}
      {query.data?.length > 0 && (
        <div className="space-y-6">
          <PortfolioSummary properties={query.data} />
          <ul className="grid gap-4 md:grid-cols-2">
            {query.data.map((p) => (
              <li key={p.id}>
                <PropertyCard property={p} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
