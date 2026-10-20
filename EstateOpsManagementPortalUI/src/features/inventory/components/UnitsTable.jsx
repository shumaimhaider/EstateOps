import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Area from '@/shared/ui/Area.jsx';
import DataTable from '@/shared/ui/DataTable.jsx';
import Money from '@/shared/ui/Money.jsx';
import { unitShape } from '../domain/unit.model.js';
import { unitLocationLabel } from '../domain/unit.rules.js';
import UnitActions from './UnitActions.jsx';
import UnitStatusPill from './UnitStatusPill.jsx';

/** Server-sorted, selectable unit table built on the shared DataTable. */
export default function UnitsTable({
  units,
  sort,
  onSortChange,
  onAction,
  actionPending,
  toolbarStart,
}) {
  const { t } = useTranslation('inventory');

  const columns = useMemo(
    () => [
      {
        id: 'unitNo',
        header: t('columns.unitNo'),
        meta: { sortField: 'unitNo' },
        cell: ({ row }) => (
          <Link
            className="font-semibold text-primary hover:underline"
            to={`/inventory/units/${row.original.id}`}
            aria-label={t('units.viewUnit', { unitNo: row.original.unitNo })}
          >
            {row.original.unitNo}
          </Link>
        ),
      },
      { id: 'project', header: t('columns.project'), accessorFn: (u) => u.projectName },
      {
        id: 'location',
        header: t('columns.location'),
        accessorFn: (u) => unitLocationLabel(u) || '—',
      },
      { id: 'kind', header: t('columns.kind'), accessorFn: (u) => t(`kind.${u.kind}`) },
      {
        id: 'area',
        header: t('columns.area'),
        meta: { sortField: 'areaValue' },
        cell: ({ row }) => <Area value={row.original.area.value} unit={row.original.area.unit} />,
      },
      { id: 'bedrooms', header: t('columns.bedrooms'), accessorFn: (u) => u.bedrooms ?? '—' },
      {
        id: 'status',
        header: t('columns.status'),
        meta: { sortField: 'status' },
        cell: ({ row }) => <UnitStatusPill status={row.original.status} />,
      },
      {
        id: 'price',
        header: t('columns.price'),
        meta: { sortField: 'listPrice', align: 'end' },
        cell: ({ row }) => (
          <Money minor={row.original.listPrice.minor} currency={row.original.listPrice.currency} />
        ),
      },
      {
        id: 'actions',
        header: t('columns.actions'),
        enableHiding: false,
        meta: { srOnly: true },
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <UnitActions unit={row.original} onAction={onAction} pending={actionPending} />
          </div>
        ),
      },
    ],
    [t, onAction, actionPending],
  );

  return (
    <DataTable
      columns={columns}
      data={units}
      getRowId={(u) => u.id}
      label={t('units.tableLabel')}
      sort={sort}
      onSortChange={onSortChange}
      selectable
      toolbarStart={toolbarStart}
    />
  );
}

UnitsTable.propTypes = {
  units: PropTypes.arrayOf(unitShape).isRequired,
  sort: PropTypes.shape({ field: PropTypes.string, dir: PropTypes.string }),
  onSortChange: PropTypes.func.isRequired,
  onAction: PropTypes.func.isRequired,
  actionPending: PropTypes.bool,
  toolbarStart: PropTypes.node,
};
