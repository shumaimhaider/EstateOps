import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
import { useEscalationsQuery } from '@/features/collections/index.js';
import Card from '@/shared/ui/Card.jsx';
import Money from '@/shared/ui/Money.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';

const TOP = 4;

/** Dashboard callout: the worst escalated cases, linking to the full list in the stats section. */
export default function EscalationSpotlight() {
  const { t } = useTranslation('collections');
  const query = useEscalationsQuery();
  const total = query.escalations.length;
  return (
    <Card as="section" aria-labelledby="escalation-spotlight">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="escalation-spotlight" className="flex items-center gap-2 text-base font-semibold">
            <TriangleAlert aria-hidden="true" className="size-5 text-tone-danger-fg" />
            {t('escalations.title')}
          </h2>
          <p className="text-sm text-content-muted">
            {query.isSuccess
              ? t('escalations.count', { count: total })
              : t('escalations.subtitleShort')}
          </p>
        </div>
        <Link
          to="/stats/escalations"
          className="text-sm font-semibold text-primary hover:underline"
        >
          {t('escalations.viewAll')}
        </Link>
      </div>
      {query.isPending && <Skeleton rows={3} />}
      {query.isSuccess && total === 0 && (
        <p className="mt-4 text-sm text-content-muted">{t('escalations.emptyBody')}</p>
      )}
      <ul className="mt-4 divide-y divide-border">
        {query.escalations.slice(0, TOP).map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <Link to={`/sales/${e.bookingId}`} className="min-w-0 hover:underline">
              <span className="block truncate font-semibold">
                {e.unitNo} · {e.buyerName}
              </span>
              <span className="text-xs text-content-muted">
                {t('escalations.missed', { count: e.missedInstallments })} ·{' '}
                {t('status.daysLate', { count: e.daysLate })}
              </span>
            </Link>
            <span className="shrink-0 font-semibold text-tone-danger-fg">
              <Money minor={e.overdue.minor} currency={e.overdue.currency} />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
