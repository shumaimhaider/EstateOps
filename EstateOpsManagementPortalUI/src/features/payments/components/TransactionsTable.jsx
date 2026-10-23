import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import Button from '@/shared/ui/Button.jsx';
import DataTable from '@/shared/ui/DataTable.jsx';
import DateTime from '@/shared/ui/DateTime.jsx';
import EmptyState from '@/shared/ui/EmptyState.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import LoadMore from '@/shared/ui/LoadMore.jsx';
import Money from '@/shared/ui/Money.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import { formatMoney } from '@/shared/lib/money.js';
import { useTenant } from '@/shared/lib/tenant.jsx';
import { useTransactionsQuery } from '../hooks/useTransactions.js';
import TransactionDetailDialog from './TransactionDetailDialog.jsx';
import TransactionStatusPill from './TransactionStatusPill.jsx';

const STATUSES = ['', 'succeeded', 'failed', 'pending', 'refunded', 'canceled'];

/** Card transactions for an invoice, a booking, a customer or everything. Filtered by status. */
export default function TransactionsTable({
  filters = {},
  label,
  showFilter = true,
  canInspect = false,
}) {
  const { t } = useTranslation('payments');
  const { locale } = useTenant();
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState(null);
  const query = useTransactionsQuery({ ...filters, status });

  const columns = useMemo(
    () => [
      {
        id: 'when',
        header: t('transactions.columns.when'),
        cell: ({ row }) => <DateTime iso={row.original.createdAt} />,
      },
      {
        id: 'amount',
        header: t('transactions.columns.amount'),
        meta: { align: 'end' },
        cell: ({ row }) => (
          <Money minor={row.original.amount.minor} currency={row.original.amount.currency} />
        ),
      },
      {
        id: 'card',
        header: t('transactions.columns.card'),
        cell: ({ row }) =>
          row.original.cardLast4 ? `${row.original.cardBrand} •••• ${row.original.cardLast4}` : '—',
      },
      {
        id: 'status',
        header: t('transactions.columns.status'),
        cell: ({ row }) => <TransactionStatusPill status={row.original.status} />,
      },
      {
        id: 'how',
        header: t('transactions.columns.how'),
        cell: ({ row }) => t(`transactions.trigger.${row.original.trigger}`),
      },
      {
        id: 'reason',
        header: t('transactions.columns.reason'),
        cell: ({ row }) => row.original.failureMessage ?? '—',
      },
      {
        id: 'details',
        header: t('transactions.details'),
        cell: ({ row }) =>
          canInspect && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('transactions.detailsLabel', {
                amount: formatMoney(
                  row.original.amount.minor,
                  row.original.amount.currency,
                  locale,
                ),
                when: row.original.createdAt.slice(0, 10),
              })}
              onClick={() => setOpenId(row.original.id)}
            >
              {t('transactions.details')}
            </Button>
          ),
      },
    ],
    [t, canInspect, locale],
  );

  return (
    <div>
      {showFilter && (
        <div className="mb-3 flex items-center gap-2">
          <label htmlFor="tx-status" className="text-sm font-medium">
            {t('transactions.filterStatus')}
          </label>
          <select
            id="tx-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-1.5 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s || 'all'} value={s}>
                {s ? t(`transactions.status.${s}`) : t('transactions.all')}
              </option>
            ))}
          </select>
        </div>
      )}
      {query.isPending && <Skeleton rows={4} />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.isSuccess && query.transactions.length === 0 && (
        <EmptyState title={t('transactions.empty')} />
      )}
      {query.isSuccess && query.transactions.length > 0 && (
        <DataTable
          columns={columns}
          data={query.transactions}
          getRowId={(r) => r.id}
          label={label ?? t('transactions.label')}
        />
      )}
      <LoadMore
        hasNextPage={query.hasNextPage}
        loading={query.isFetchingNextPage}
        onClick={() => query.fetchNextPage()}
      />
      <TransactionDetailDialog transactionId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

TransactionsTable.propTypes = {
  filters: PropTypes.shape({
    invoiceId: PropTypes.string,
    bookingId: PropTypes.string,
    customerId: PropTypes.string,
  }),
  label: PropTypes.string,
  showFilter: PropTypes.bool,
  /** Whether this user may open a transaction to see Stripe's stored answer. */
  canInspect: PropTypes.bool,
};
