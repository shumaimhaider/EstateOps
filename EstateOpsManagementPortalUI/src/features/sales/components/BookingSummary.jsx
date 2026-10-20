import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Banknote, CalendarClock, ReceiptText, TriangleAlert, Wallet } from 'lucide-react';
import Card from '@/shared/ui/Card.jsx';
import DateOnly from '@/shared/ui/DateOnly.jsx';
import Money from '@/shared/ui/Money.jsx';
import ProgressBar from '@/shared/ui/ProgressBar.jsx';
import StatTile from '@/shared/ui/StatTile.jsx';
import { receivedPercent } from '../domain/booking.rules.js';
import { bookingShape } from '../domain/booking.model.js';
import BookingStatusPill from './BookingStatusPill.jsx';

/** Booking detail header: buyer and unit, plus the payment position (received, pending, installments). */
export default function BookingSummary({ booking }) {
  const { t } = useTranslation('sales');
  const m = (v) => <Money minor={v.minor} currency={v.currency} />;
  const i = booking.installments;
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-content-muted">{t('detail.customer')}</p>
          <Link
            to={`/customers/${booking.customerId}`}
            className="text-lg font-semibold hover:underline"
          >
            {booking.buyerName}
          </Link>
          <p className="text-sm text-content-muted">
            {booking.buyerPhone} · {booking.buyerEmail}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-content-muted">{t('detail.unit')}</p>
          <Link
            to={`/inventory/units/${booking.unitId}`}
            className="text-lg font-semibold hover:underline"
          >
            {booking.unitNo}
          </Link>
          <p className="text-sm text-content-muted">
            {booking.projectName} · {t(`unitKind.${booking.unitKind}`)}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-content-muted">{t('detail.plan')}</p>
          <p className="font-semibold">{booking.planName}</p>
          <p className="text-sm text-content-muted">
            {t('detail.bookedOn')} <DateOnly value={booking.bookedAt} />
          </p>
        </div>
        <BookingStatusPill status={booking.status} />
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label={t('detail.totalPrice')} value={m(booking.totalPrice)} icon={Banknote} />
        <StatTile
          label={t('detail.received')}
          value={m(booking.received)}
          hint={t('detail.receivedPercent', { percent: Math.round(receivedPercent(booking)) })}
          icon={Wallet}
          tone="success"
        />
        <StatTile
          label={t('detail.pending')}
          value={m(booking.pending)}
          icon={CalendarClock}
          tone="info"
        />
        <StatTile
          label={t('detail.overdue')}
          value={m(booking.overdue)}
          icon={TriangleAlert}
          tone="danger"
        />
        <StatTile
          label={t('detail.installments')}
          value={`${i.total}`}
          hint={t('detail.installmentBreakdown', {
            paid: i.paid,
            due: i.due + i.overdue,
            upcoming: i.upcoming,
          })}
          icon={ReceiptText}
        />
      </div>
      <Card>
        <p className="mb-2 text-sm font-medium">{t('detail.progress')}</p>
        <ProgressBar value={receivedPercent(booking)} label={t('detail.progress')} tone="success" />
      </Card>
    </div>
  );
}

BookingSummary.propTypes = { booking: bookingShape.isRequired };
