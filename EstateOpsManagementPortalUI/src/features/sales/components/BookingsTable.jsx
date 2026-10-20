import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import DataTable from '@/shared/ui/DataTable.jsx';
import DateOnly from '@/shared/ui/DateOnly.jsx';
import Money from '@/shared/ui/Money.jsx';
import { moneyCell } from '@/shared/ui/moneyCell.jsx';
import ProgressBar from '@/shared/ui/ProgressBar.jsx';
import StatusPill from '@/shared/ui/StatusPill.jsx';
import { paidPercent } from '../domain/booking.rules.js';
import { bookingShape } from '../domain/booking.model.js';
import BookingStatusPill from './BookingStatusPill.jsx';

/** Per-unit sales and EMI position: price, received, pending, installments scheduled and progress. */
export default function BookingsTable({
  bookings,
  sort,
  onSortChange,
  toolbarStart,
  hiddenColumns = {},
}) {
  const { t } = useTranslation('sales');
  const columns = useMemo(
    () => [
      {
        id: 'unit',
        header: t('columns.unit'),
        meta: { sortField: 'unitNo' },
        cell: ({ row }) => (
          <Link
            className="font-semibold text-primary hover:underline"
            to={`/sales/${row.original.id}`}
          >
            {row.original.unitNo}
            <span className="block text-xs font-normal text-content-muted">
              {row.original.projectName} · {t(`unitKind.${row.original.unitKind}`)}
            </span>
          </Link>
        ),
      },
      {
        id: 'customer',
        header: t('columns.customer'),
        cell: ({ row }) => (
          <Link className="hover:underline" to={`/customers/${row.original.customerId}`}>
            {row.original.buyerName}
          </Link>
        ),
      },
      { id: 'plan', header: t('columns.plan'), accessorFn: (b) => b.planName },
      {
        id: 'totalPrice',
        header: t('columns.totalPrice'),
        meta: { sortField: 'totalPrice', align: 'end' },
        cell: moneyCell((b) => b.totalPrice),
      },
      {
        id: 'received',
        header: t('columns.received'),
        meta: { sortField: 'received', align: 'end' },
        cell: moneyCell((b) => b.received),
      },
      {
        id: 'pending',
        header: t('columns.pending'),
        meta: { sortField: 'pending', align: 'end' },
        cell: moneyCell((b) => b.pending),
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
        id: 'installments',
        header: t('columns.installments'),
        cell: ({ row }) => {
          const b = row.original;
          return (
            <div className="min-w-24">
              <p className="mb-1 text-xs tabular-nums">
                {t('installmentsOf', { paid: b.installments.paid, total: b.installments.total })}
              </p>
              <ProgressBar
                value={paidPercent(b)}
                label={t('installmentProgress', { unit: b.unitNo })}
              />
            </div>
          );
        },
      },
      {
        id: 'nextDue',
        header: t('columns.nextDue'),
        meta: { sortField: 'nextDue' },
        cell: ({ row }) => <DateOnly value={row.original.nextDueDate} />,
      },
      {
        id: 'invoices',
        header: t('columns.invoices'),
        enableHiding: false,
        meta: { align: 'end' },
        cell: ({ row }) => (
          <Link
            to={`/sales/${row.original.id}`}
            aria-label={t('viewInvoicesFor', { unit: row.original.unitNo })}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-primary-soft"
          >
            {t('viewInvoices')}
            <ChevronRight aria-hidden="true" className="size-3.5 rtl:rotate-180" />
          </Link>
        ),
      },
      {
        id: 'status',
        header: t('columns.status'),
        cell: ({ row }) => (
          <span className="inline-flex flex-wrap gap-1.5">
            <BookingStatusPill status={row.original.status} />
            {row.original.isEscalated && <StatusPill label={t('escalated')} tone="danger" />}
          </span>
        ),
      },
    ],
    [t],
  );

  return (
    <DataTable
      columns={columns}
      data={bookings}
      getRowId={(b) => b.id}
      label={t('tableLabel')}
      sort={sort}
      onSortChange={onSortChange}
      toolbarStart={toolbarStart}
      initialColumnVisibility={hiddenColumns}
    />
  );
}

BookingsTable.propTypes = {
  bookings: PropTypes.arrayOf(bookingShape).isRequired,
  sort: PropTypes.shape({ field: PropTypes.string, dir: PropTypes.string }),
  onSortChange: PropTypes.func,
  toolbarStart: PropTypes.node,
  hiddenColumns: PropTypes.object,
};
