import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { InvoicesTable, PayInvoiceDialog, useInvoicesQuery } from '@/features/collections/index.js';
import { BookingSummary, useBookingQuery } from '@/features/sales/index.js';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import { useAllPages } from './useAllPages.js';
import { usePaymentFlow } from './usePaymentFlow.js';

const SCHEDULE_SORT = { field: 'sequence', dir: 'asc' };

/** A booking's payment position and its full EMI schedule, with record-payment on each invoice. */
export default function BookingPaymentsPanel({ bookingId }) {
  const { t } = useTranslation('sales');
  const booking = useBookingQuery(bookingId);
  const invoices = useInvoicesQuery({ bookingId, sort: SCHEDULE_SORT });
  useAllPages(invoices);
  const flow = usePaymentFlow(invoices.invoices);

  if (booking.isPending) return <Skeleton rows={5} />;
  if (booking.isError)
    return <ErrorState error={booking.error} onRetry={() => booking.refetch()} />;

  return (
    <div className="space-y-6">
      <BookingSummary booking={booking.data} />
      <section aria-labelledby="emi-schedule">
        <h2 id="emi-schedule" className="text-lg font-semibold">
          {t('detail.schedule')}
        </h2>
        <p className="mb-3 text-sm text-content-muted">{t('detail.scheduleHint')}</p>
        {invoices.isPending && <Skeleton rows={6} />}
        {invoices.isError && (
          <ErrorState error={invoices.error} onRetry={() => invoices.refetch()} />
        )}
        {invoices.isSuccess && (
          <InvoicesTable
            invoices={invoices.invoices}
            variant="schedule"
            onRecordPayment={flow.open}
            toolbarStart={t('detail.scheduleCount', { count: invoices.invoices.length })}
          />
        )}
      </section>
      <PayInvoiceDialog {...flow.dialogProps} />
    </div>
  );
}

BookingPaymentsPanel.propTypes = { bookingId: PropTypes.string.isRequired };
