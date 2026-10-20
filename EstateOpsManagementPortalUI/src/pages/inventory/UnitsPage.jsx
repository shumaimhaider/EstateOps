import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import {
  UnitFilters,
  UnitFormDialog,
  UnitsTable,
  useCreateUnitMutation,
  useProjectsQuery,
  useUnitActionHandler,
  useUnitFilters,
  useUnitsQuery,
} from '@/features/inventory/index.js';
import { useTenant } from '@/shared/lib/tenant.jsx';
import Button from '@/shared/ui/Button.jsx';
import Card from '@/shared/ui/Card.jsx';
import EmptyState from '@/shared/ui/EmptyState.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import LoadMore from '@/shared/ui/LoadMore.jsx';
import PageHeader from '@/shared/ui/PageHeader.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import { useToast } from '@/shared/ui/toast/toastContext.js';

/** All units: sold and unsold, filterable by project, type and status (filters live in the URL). */
export default function UnitsPage() {
  const { t } = useTranslation('inventory');
  const tenant = useTenant();
  const toast = useToast();
  const [creating, setCreating] = useState(false);

  const { filters, setFilters } = useUnitFilters();
  const unitsQuery = useUnitsQuery(filters);
  const projectsQuery = useProjectsQuery();
  const createUnit = useCreateUnitMutation();
  const unitAction = useUnitActionHandler();

  const handleCreate = async (draft) => {
    const unit = await createUnit.mutateAsync(draft);
    toast.show({ tone: 'success', message: t('form.created', { unitNo: unit.unitNo }) });
    setCreating(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('units.title')}
        description={t('units.subtitle')}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" className="size-4" />
            {t('units.new')}
          </Button>
        }
      />

      <Card>
        <UnitFilters filters={filters} projects={projectsQuery.data ?? []} onChange={setFilters} />
      </Card>

      {unitsQuery.isPending && <Skeleton rows={8} />}
      {unitsQuery.isError && (
        <ErrorState
          title={t('units.loadError')}
          error={unitsQuery.error}
          onRetry={() => unitsQuery.refetch()}
        />
      )}
      {unitsQuery.isSuccess && unitsQuery.units.length === 0 && (
        <EmptyState title={t('units.emptyTitle')} body={t('units.emptyBody')} />
      )}
      {unitsQuery.isSuccess && unitsQuery.units.length > 0 && (
        <div>
          <UnitsTable
            units={unitsQuery.units}
            sort={filters.sort}
            onSortChange={(sort) => setFilters({ sort })}
            onAction={unitAction.handleAction}
            actionPending={unitAction.isPending}
            toolbarStart={t('units.count', { count: unitsQuery.units.length })}
          />
          <LoadMore
            hasNextPage={unitsQuery.hasNextPage}
            loading={unitsQuery.isFetchingNextPage}
            onClick={() => unitsQuery.fetchNextPage()}
          />
        </div>
      )}

      <UnitFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSubmit={handleCreate}
        projects={projectsQuery.data ?? []}
        currency={tenant.currency}
        areaUnit={tenant.areaUnit}
      />
    </div>
  );
}
