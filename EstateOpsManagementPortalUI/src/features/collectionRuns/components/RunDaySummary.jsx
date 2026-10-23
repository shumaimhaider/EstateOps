import { useTranslation } from 'react-i18next';
import { CircleAlert, HandCoins, ListChecks, SkipForward } from 'lucide-react';
import Money from '@/shared/ui/Money.jsx';
import StatTile from '@/shared/ui/StatTile.jsx';
import { runShape } from '../domain/attempt.model.js';

/** The day's totals. Four tiles: two columns on a phone, four on a wide screen. */
export default function RunDaySummary({ run }) {
  const { t } = useTranslation('collectionRuns');
  return (
    <section
      aria-label={t('dayTitle', { date: run.runDate })}
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      <StatTile label={t('stats.invoices')} value={run.invoices} icon={ListChecks} />
      <StatTile
        label={t('stats.collected')}
        value={
          run.collected ? (
            <Money minor={run.collected.minor} currency={run.collected.currency} />
          ) : (
            '—'
          )
        }
        hint={t('day.succeeded', { count: run.succeeded })}
        icon={HandCoins}
        tone="success"
      />
      <StatTile
        label={t('stats.failedAmount')}
        value={
          run.failedAmount ? (
            <Money minor={run.failedAmount.minor} currency={run.failedAmount.currency} />
          ) : (
            '—'
          )
        }
        hint={t('day.failed', { count: run.failed })}
        icon={CircleAlert}
        tone="danger"
      />
      <StatTile label={t('stats.skipped')} value={run.skipped} icon={SkipForward} tone="warning" />
    </section>
  );
}
RunDaySummary.propTypes = { run: runShape.isRequired };
