import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import DateTime from '@/shared/ui/DateTime.jsx';
import EmptyState from '@/shared/ui/EmptyState.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import LoadMore from '@/shared/ui/LoadMore.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import StatusPill from '@/shared/ui/StatusPill.jsx';
import { useRequestsQuery } from '../hooks/support.hooks.js';

const TONE = { open: 'info', answered: 'success', closed: 'neutral' };

/** The customer's conversations, most recently active first. */
export default function RequestsList({ basePath }) {
  const { t } = useTranslation('support');
  const query = useRequestsQuery();
  if (query.isPending) return <Skeleton rows={3} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.requests.length === 0) return <EmptyState title={t('list.empty')} />;
  return (
    <div>
      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
        {query.requests.map((r) => (
          <li key={r.id}>
            <Link
              to={`${basePath}/${r.id}`}
              className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-surface-muted"
            >
              <span>
                <span className="block font-medium">{r.subject}</span>
                <span className="text-xs text-content-muted">
                  {t('list.lastActivity')} <DateTime iso={r.lastMessageAt} />
                </span>
              </span>
              <StatusPill label={t(`status.${r.status}`)} tone={TONE[r.status]} />
            </Link>
          </li>
        ))}
      </ul>
      <LoadMore
        hasNextPage={query.hasNextPage}
        loading={query.isFetchingNextPage}
        onClick={() => query.fetchNextPage()}
      />
    </div>
  );
}
RequestsList.propTypes = { basePath: PropTypes.string.isRequired };
