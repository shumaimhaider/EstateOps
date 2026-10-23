import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { HandCoins } from 'lucide-react';
import { PayInvoiceDialog, useInvoicesQuery } from '@/features/collections/index.js';
import { BookingsTable, useBookingsQuery } from '@/features/sales/index.js';
import Button from '@/shared/ui/Button.jsx';
import ErrorState from '@/shared/ui/ErrorState.jsx';
import Skeleton from '@/shared/ui/Skeleton.jsx';
import { useAllPages } from './useAllPages.js';
import { usePaymentFlow } from './usePaymentFlow.js';

const HIDE_ON_CUSTOMER_PAGE = { customer: false, plan: false };
const SORT = { field: 'dueDate', dir: 'asc' };

/**
 * The properties a customer owns. Each row opens that property's own invoices; "Take payment"
 * records a payment on the customer's behalf against any of their unpaid invoices.
 */
export default function CustomerPaymentsPanel({ customerId }) {
  const { t } = useTranslation('customers');
  const bookings = useBookingsQuery({ customerId });
  // Unpaid invoices feed the Take payment dialog; they are not listed on this page.
  const invoices = useInvoicesQuery({ customerId, sort: SORT });
  useAllPages(invoices);
  const flow = usePaymentFlow(invoices.invoices, { customerId });

  return (
    <section aria-labelledby="customer-properties">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="customer-properties" className="text-lg font-semibold">
            {bookings.isSuccess
              ? t('detail.propertiesOwned', { count: bookings.bookings.length })
              : t('detail.properties')}
          </h2>
          <p className="text-sm text-content-muted">{t('detail.propertiesHint')}</p>
        </div>
        <Button onClick={() => flow.open()} disabled={flow.payable.length === 0}>
          <HandCoins aria-hidden="true" className="size-4" />
          {t('detail.takePayment')}
        </Button>
      </div>
      {bookings.isPending && <Skeleton rows={3} />}
      {bookings.isError && <ErrorState error={bookings.error} onRetry={() => bookings.refetch()} />}
      {bookings.isSuccess && (
        <BookingsTable bookings={bookings.bookings} hiddenColumns={HIDE_ON_CUSTOMER_PAGE} />
      )}
      <PayInvoiceDialog {...flow.dialogProps} />
    </section>
  );
}

CustomerPaymentsPanel.propTypes = { customerId: PropTypes.string.isRequired };
