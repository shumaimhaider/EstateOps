import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Banknote, CalendarClock, TriangleAlert, Wallet } from 'lucide-react';
import Avatar from '@/shared/ui/Avatar.jsx';
import Card from '@/shared/ui/Card.jsx';
import Money from '@/shared/ui/Money.jsx';
import StatTile from '@/shared/ui/StatTile.jsx';
import { customerShape } from '../domain/customer.model.js';

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-content-muted">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}
Detail.propTypes = { label: PropTypes.string.isRequired, children: PropTypes.node };

/** Profile card plus the customer's money position across every unit they hold. */
export default function CustomerProfile({ customer }) {
  const { t } = useTranslation('customers');
  const m = (v) => <Money minor={v.minor} currency={v.currency} />;
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-6">
        <Avatar name={customer.fullName} />
        <dl className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Detail label={t('profile.phone')}>{customer.phone}</Detail>
          <Detail label={t('profile.email')}>{customer.email}</Detail>
          <Detail label={t('profile.idNumber')}>
            <span className="font-mono">{customer.idNumberMasked}</span>
          </Detail>
          <Detail label={t('profile.city')}>{customer.city}</Detail>
          <Detail label={t('profile.language')}>{customer.preferredLanguage.toUpperCase()}</Detail>
        </dl>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={t('profile.totalValue')}
          value={m(customer.totalValue)}
          hint={t('unitsCount', { count: customer.bookingsCount })}
          icon={Banknote}
        />
        <StatTile
          label={t('profile.received')}
          value={m(customer.received)}
          icon={Wallet}
          tone="success"
        />
        <StatTile
          label={t('profile.pending')}
          value={m(customer.pending)}
          icon={CalendarClock}
          tone="info"
        />
        <StatTile
          label={t('profile.overdue')}
          value={m(customer.overdue)}
          icon={TriangleAlert}
          tone="danger"
        />
      </div>
    </div>
  );
}

CustomerProfile.propTypes = { customer: customerShape.isRequired };
