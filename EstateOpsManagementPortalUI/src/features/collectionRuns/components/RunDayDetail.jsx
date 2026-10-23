import PropTypes from 'prop-types';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import EmptyState from '@/shared/ui/EmptyState.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import LoadMore from '@/shared/ui/LoadMore.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import { useRunAttemptsQuery } from '../hooks/collectionRuns.hooks.js';
import AttemptsList from './AttemptsList.jsx';
import RunDaySummary from './RunDaySummary.jsx';

const FILTERS = ['', 'succeeded', 'failed', 'skipped', 'refunded', 'queued', 'in_progress'];

/** One day: its totals, a result filter kept in the address (so a link shares it), and the invoices. */
export default function RunDayDetail({ date }) {
  const { t } = useTranslation('collectionRuns');
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const query = useRunAttemptsQuery(date, status || undefined);

  const setStatus = (value) => {
    const next = new URLSearchParams(params);
    if (value) next.set('status', value);
    else next.delete('status');
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-5">
      {query.summary && <RunDaySummary run={query.summary} />}
      {query.summary?.error && (
        <p role="alert" className="rounded-xl bg-tone-danger-bg p-3 text-sm text-tone-danger-fg">
          {t('runFailed', { message: query.summary.error })}
        </p>
      )}
      <div>
        <label htmlFor="result-filter" className="mb-1 block text-sm font-medium">
          {t('filter.label')}
        </label>
        <select
          id="result-filter"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm sm:w-64"
        >
          {FILTERS.map((f) => (
            <option key={f} value={f}>
              {f ? t(`filter.${f}`) : t('filter.all')}
            </option>
          ))}
        </select>
      </div>
      {query.isPending && <Skeleton rows={4} />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.isSuccess && query.attempts.length === 0 && (
        <EmptyState title={status ? t('emptyFiltered') : t('emptyDay')} />
      )}
      {query.attempts.length > 0 && <AttemptsList attempts={query.attempts} />}
      <LoadMore
        hasNextPage={query.hasNextPage}
        loading={query.isFetchingNextPage}
        onClick={() => query.fetchNextPage()}
      />
    </div>
  );
}
RunDayDetail.propTypes = { date: PropTypes.string.isRequired };
