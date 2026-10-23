import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { CalendarClock, CircleAlert, HandCoins, Wallet } from 'lucide-react';
import DateOnly from '@/shared/ui/DateOnly.jsx';
import Money from '@/shared/ui/Money.jsx';
import StatTile from '@/shared/ui/StatTile.jsx';
import { propertyShape } from '../domain/property.model.js';
import { portfolio } from '../domain/property.rules.js';

/** Totals across all the customer's properties: what they bought, paid, still owe and what is late. */
export default function PortfolioSummary({ properties }) {
  const { t } = useTranslation('properties');
  const p = portfolio(properties);
  const cur = p.currency;
  return (
    <section aria-label={t('summary.label')} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        label={t('summary.paid')}
        value={<Money minor={p.received} currency={cur} />}
        hint={t('summary.of', { count: p.count })}
        icon={HandCoins}
        tone="success"
      />
      <StatTile
        label={t('summary.pending')}
        value={<Money minor={p.pending} currency={cur} />}
        icon={Wallet}
      />
      <StatTile
        label={t('summary.overdue')}
        value={<Money minor={p.overdue} currency={cur} />}
        hint={p.overdue > 0 ? t('summary.overdueHint') : t('summary.onTime')}
        icon={CircleAlert}
        tone={p.overdue > 0 ? 'danger' : 'info'}
      />
      <StatTile
        label={t('summary.nextDue')}
        value={p.nextDue ? <DateOnly value={p.nextDue} /> : '—'}
        icon={CalendarClock}
        tone="warning"
      />
    </section>
  );
}
PortfolioSummary.propTypes = { properties: PropTypes.arrayOf(propertyShape).isRequired };
