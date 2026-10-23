import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Card from '@/shared/ui/Card.jsx';
import DateOnly from '@/shared/ui/DateOnly.jsx';
import Money from '@/shared/ui/Money.jsx';
import ProgressBar from '@/shared/ui/ProgressBar.jsx';
import StatusPill from '@/shared/ui/StatusPill.jsx';
import { propertyShape } from '../domain/property.model.js';
import { attention, paidPercent } from '../domain/property.rules.js';

const TONE = { overdue: 'danger', due: 'warning', complete: 'success', ontrack: 'info' };

/** One property: what it is, how much is paid, what is pending or late, and a link to its schedule. */
export default function PropertyCard({ property }) {
  const { t } = useTranslation('properties');
  const pct = paidPercent(property);
  const state = attention(property);
  const i = property.installments;
  return (
    <Card as="article" aria-labelledby={`prop-${property.id}`} className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={`prop-${property.id}`} className="text-lg font-semibold">
            <Link to={`/properties/${property.id}`} className="hover:underline">
              {t('card.title', { kind: t(`kind.${property.kind}`), unit: property.unitNo })}
            </Link>
          </h2>
          <p className="text-sm text-content-muted">{property.projectName}</p>
        </div>
        <StatusPill label={t(`attention.${state}`)} tone={TONE[state]} />
      </div>
      <div>
        <div className="mb-1 flex items-baseline justify-between text-sm">
          <span className="text-content-muted">{t('card.paidOf')}</span>
          <span className="font-semibold tabular-nums">{pct}%</span>
        </div>
        <ProgressBar
          value={pct}
          label={t('card.progress', { unit: property.unitNo })}
          tone={state === 'complete' ? 'success' : 'primary'}
        />
        <p className="mt-1 text-xs text-content-muted">
          <Money minor={property.received.minor} currency={property.currency} /> /{' '}
          <Money minor={property.total.minor} currency={property.currency} />
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs text-content-muted">{t('card.pending')}</dt>
          <dd className="font-medium">
            <Money minor={property.pending.minor} currency={property.currency} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-content-muted">{t('card.overdue')}</dt>
          <dd className={`font-medium ${property.overdue.minor > 0 ? 'text-danger' : ''}`}>
            <Money minor={property.overdue.minor} currency={property.currency} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-content-muted">{t('card.nextDue')}</dt>
          <dd className="font-medium">
            <DateOnly value={property.nextDueDate} />
          </dd>
        </div>
      </dl>
      <p className="text-xs text-content-muted">
        {t('card.installments', {
          paid: i.paid,
          total: i.total,
          overdue: i.overdue,
          upcoming: i.upcoming,
        })}
      </p>
    </Card>
  );
}
PropertyCard.propTypes = { property: propertyShape.isRequired };
