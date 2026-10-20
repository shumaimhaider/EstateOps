import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Avatar from '@/shared/ui/Avatar.jsx';
import DataTable from '@/shared/ui/DataTable.jsx';
import Money from '@/shared/ui/Money.jsx';
import { moneyCell } from '@/shared/ui/moneyCell.jsx';
import StatusPill from '@/shared/ui/StatusPill.jsx';
import { customerShape } from '../domain/customer.model.js';

export default function CustomersTable({ customers, sort, onSortChange, toolbarStart }) {
  const { t } = useTranslation('customers');
  const columns = useMemo(
    () => [
      {
        id: 'customer',
        header: t('columns.customer'),
        meta: { sortField: 'fullName' },
        cell: ({ row }) => (
          <Link
            className="flex items-center gap-3 hover:underline"
            to={`/customers/${row.original.id}`}
          >
            <Avatar name={row.original.fullName} size="sm" />
            <span>
              <span className="block font-semibold">{row.original.fullName}</span>
              <span className="block text-xs font-normal text-content-muted">
                {row.original.city}
              </span>
            </span>
          </Link>
        ),
      },
      {
        id: 'contact',
        header: t('columns.contact'),
        cell: ({ row }) => (
          <span>
            {row.original.phone}
            <span className="block text-xs text-content-muted">{row.original.email}</span>
          </span>
        ),
      },
      {
        id: 'units',
        header: t('columns.units'),
        meta: { sortField: 'bookingsCount' },
        cell: ({ row }) => (
          <span>
            {t('unitsCount', { count: row.original.bookingsCount })}
            <span className="block text-xs text-content-muted">
              {row.original.units.join(', ')}
            </span>
          </span>
        ),
      },
      {
        id: 'totalValue',
        header: t('columns.totalValue'),
        meta: { sortField: 'totalValue', align: 'end' },
        cell: moneyCell((c) => c.totalValue),
      },
      {
        id: 'received',
        header: t('columns.received'),
        meta: { sortField: 'received', align: 'end' },
        cell: moneyCell((c) => c.received),
      },
      {
        id: 'pending',
        header: t('columns.pending'),
        meta: { sortField: 'pending', align: 'end' },
        cell: moneyCell((c) => c.pending),
      },
      {
        id: 'overdue',
        header: t('columns.overdue'),
        meta: { sortField: 'overdue', align: 'end' },
        cell: ({ row }) =>
          row.original.overdue.minor > 0 ? (
            <span className="font-semibold text-tone-danger-fg">
              <Money minor={row.original.overdue.minor} currency={row.original.overdue.currency} />
            </span>
          ) : (
            '—'
          ),
      },
      {
        id: 'flags',
        header: t('columns.flags'),
        cell: ({ row }) =>
          row.original.escalatedCount > 0 ? (
            <StatusPill
              label={t('escalated', { count: row.original.escalatedCount })}
              tone="danger"
            />
          ) : null,
      },
    ],
    [t],
  );

  return (
    <DataTable
      columns={columns}
      data={customers}
      getRowId={(c) => c.id}
      label={t('tableLabel')}
      sort={sort}
      onSortChange={onSortChange}
      toolbarStart={toolbarStart}
    />
  );
}

CustomersTable.propTypes = {
  customers: PropTypes.arrayOf(customerShape).isRequired,
  sort: PropTypes.shape({ field: PropTypes.string, dir: PropTypes.string }),
  onSortChange: PropTypes.func,
  toolbarStart: PropTypes.node,
};
