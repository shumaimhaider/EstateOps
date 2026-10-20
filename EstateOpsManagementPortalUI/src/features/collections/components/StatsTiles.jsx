import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CalendarClock,
  Landmark,
  ReceiptText,
  Wallet,
  Banknote,
} from 'lucide-react';
import Money from '@/shared/ui/Money.jsx';
import StatTile from '@/shared/ui/StatTile.jsx';

const moneyShape = PropTypes.shape({ minor: PropTypes.number, currency: PropTypes.string });

const scope = (projectId, extra = '') => {
  const params = new URLSearchParams(extra);
  if (projectId) params.set('project', projectId);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

/** Money tiles for the selected scope. Every tile links to the list behind its number. */
export default function StatsTiles({ stats, projectId = '' }) {
  const { t } = useTranslation('collections');
  const m = (v) => <Money minor={v.minor} currency={v.currency} />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <StatTile
        label={t('tiles.saleValue')}
        value={m(stats.saleValue)}
        hint={t('tiles.bookings', { count: stats.bookingsCount })}
        icon={Landmark}
        to={`/sales${scope(projectId)}`}
      />
      <StatTile
        label={t('tiles.received')}
        value={m(stats.received)}
        hint={t('tiles.installmentsPaid', { count: stats.installments.paid })}
        icon={Wallet}
        tone="success"
        to={`/sales${scope(projectId, 'sort=received&dir=desc')}`}
      />
      <StatTile
        label={t('tiles.pending')}
        value={m(stats.pending)}
        hint={t('tiles.installmentsLeft', {
          count: stats.installments.total - stats.installments.paid,
        })}
        icon={Banknote}
        tone="info"
        to={`/sales${scope(projectId, 'sort=pending&dir=desc')}`}
      />
      <StatTile
        label={t('tiles.overdue')}
        value={m(stats.overdue)}
        hint={t('tiles.installmentsOverdue', { count: stats.installments.overdue })}
        icon={AlertTriangle}
        tone="danger"
        to={`/sales${scope(projectId, 'sort=overdue&dir=desc')}`}
      />
      <StatTile
        label={t('tiles.dueThisMonth')}
        value={m(stats.dueThisMonth)}
        icon={CalendarClock}
        tone="warning"
        to={`/sales${scope(projectId, 'sort=nextDue&dir=asc')}`}
      />
      <StatTile
        label={t('tiles.scheduled')}
        value={stats.installments.total.toLocaleString()}
        hint={t('tiles.scheduledHint', {
          paid: stats.installments.paid,
          upcoming: stats.installments.upcoming,
        })}
        icon={ReceiptText}
        to={`/sales${scope(projectId)}`}
      />
    </div>
  );
}

StatsTiles.propTypes = {
  projectId: PropTypes.string,
  stats: PropTypes.shape({
    asOf: PropTypes.string,
    saleValue: moneyShape,
    received: moneyShape,
    pending: moneyShape,
    overdue: moneyShape,
    dueThisMonth: moneyShape,
    installments: PropTypes.shape({
      total: PropTypes.number,
      paid: PropTypes.number,
      overdue: PropTypes.number,
      upcoming: PropTypes.number,
    }),
    bookingsCount: PropTypes.number,
  }).isRequired,
};
