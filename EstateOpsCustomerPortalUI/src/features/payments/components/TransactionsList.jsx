import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import DateTime from '@/shared/ui/DateTime.jsx';
import EmptyState from '@/shared/ui/EmptyState.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import LoadMore from '@/shared/ui/LoadMore.jsx';
import Money from '@/shared/ui/Money.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import StatusPill from '@/shared/ui/StatusPill.jsx';
import { useTransactionsQuery } from '../hooks/payments.hooks.js';

const TONE = {
  pending: 'info',
  succeeded: 'success',
  failed: 'danger',
  refunded: 'warning',
  canceled: 'neutral',
};

/** The customer's card payment attempts, newest first, for one property or all of them. */
export default function TransactionsList({ bookingId }) {
  const { t } = useTranslation('payments');
  const query = useTransactionsQuery(bookingId);
  if (query.isPending) return <Skeleton rows={3} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.transactions.length === 0) return <EmptyState title={t('transactions.empty')} />;
  return (
    <div>
      <div className="relative overflow-x-auto rounded-2xl border border-border bg-surface">
        <table
          aria-label={t('transactions.customerTitle')}
          className="w-full min-w-[560px] text-sm"
        >
          <thead className="bg-surface-muted text-xs uppercase tracking-wide text-content-muted">
            <tr>
              {['when', 'amount', 'card', 'status', 'reason'].map((c) => (
                <th
                  key={c}
                  scope="col"
                  className={`px-4 py-3 text-start ${c === 'amount' ? 'text-end' : ''}`}
                >
                  {t(`transactions.columns.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {query.transactions.map((tx) => (
              <tr key={tx.id}>
                <td className="px-4 py-3">
                  <DateTime iso={tx.createdAt} />
                </td>
                <td className="px-4 py-3 text-end">
                  <Money minor={tx.amount.minor} currency={tx.amount.currency} />
                </td>
                <td className="px-4 py-3">
                  {tx.cardLast4 ? `${tx.cardBrand} •••• ${tx.cardLast4}` : '—'}
                </td>
                <td className="px-4 py-3">
                  <StatusPill
                    label={t(`transactions.status.${tx.status}`)}
                    tone={TONE[tx.status]}
                  />
                </td>
                <td className="px-4 py-3">{tx.failureMessage ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <LoadMore
        hasNextPage={query.hasNextPage}
        loading={query.isFetchingNextPage}
        onClick={() => query.fetchNextPage()}
      />
    </div>
  );
}
TransactionsList.propTypes = { bookingId: PropTypes.string };
