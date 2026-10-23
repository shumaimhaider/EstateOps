import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import DateOnly from '@/shared/ui/DateOnly.jsx';
import EmptyState from '@/shared/ui/EmptyState.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import LoadMore from '@/shared/ui/LoadMore.jsx';
import Money from '@/shared/ui/Money.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import { useRunDaysQuery } from '../hooks/collectionRuns.hooks.js';

const CHIPS = [
  ['succeeded', 'text-tone-success-fg bg-tone-success-bg'],
  ['failed', 'text-tone-danger-fg bg-tone-danger-bg'],
  ['skipped', 'text-tone-neutral-fg bg-tone-neutral-bg'],
  ['waiting', 'text-tone-info-fg bg-tone-info-bg'],
  ['refunded', 'text-tone-warning-fg bg-tone-warning-bg'],
];

/** One card per day, newest first. A phone shows them stacked; a wide screen puts the amounts at the side. */
export default function RunDaysList() {
  const { t } = useTranslation('collectionRuns');
  const query = useRunDaysQuery();
  if (query.isPending) return <Skeleton rows={4} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.days.length === 0) return <EmptyState title={t('empty')} />;
  return (
    <div>
      <ul aria-label={t('daysLabel')} className="space-y-3">
        {query.days.map((d) => (
          <li key={d.runDate}>
            <Link
              to={`/payments/collections/${d.runDate}`}
              aria-label={t('open', { date: d.runDate })}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-token transition hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-semibold">
                  <DateOnly value={d.runDate} />
                </p>
                <p className="mt-2 flex flex-wrap gap-2">
                  {CHIPS.filter(([key]) => d[key] > 0).map(([key, cls]) => (
                    <span
                      key={key}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}
                    >
                      {t(`day.${key}`, { count: d[key] })}
                    </span>
                  ))}
                  {d.invoices === 0 && (
                    <span className="text-sm text-content-muted">{t('emptyDay')}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 sm:justify-end">
                {d.collected && (
                  <p className="text-sm sm:text-end">
                    <span className="block text-xs text-content-muted">{t('stats.collected')}</span>
                    <Money minor={d.collected.minor} currency={d.collected.currency} />
                  </p>
                )}
                <ChevronRight
                  aria-hidden="true"
                  className="size-5 shrink-0 text-content-muted rtl:rotate-180"
                />
              </div>
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
