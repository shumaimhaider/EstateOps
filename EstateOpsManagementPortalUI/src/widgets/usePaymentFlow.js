import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { payableInvoices, useRecordPaymentMutation } from '@/features/collections/index.js';
import { useToast } from '@/shared/ui/toast/toastContext.js';

/**
 * Take a payment on a customer's behalf. `open(invoice)` pays one invoice (row action);
 * `open()` lets the operator choose among all payable invoices (customer-level "Take payment").
 */
export function usePaymentFlow(invoices) {
  const { t } = useTranslation('collections');
  const toast = useToast();
  const record = useRecordPaymentMutation();
  const [state, setState] = useState({ open: false, single: null });

  const choices = state.single ? [state.single] : payableInvoices(invoices);
  const close = () => setState({ open: false, single: null });

  return {
    payable: payableInvoices(invoices),
    open: (invoice = null) => setState({ open: true, single: invoice }),
    dialogProps: {
      open: state.open && choices.length > 0,
      invoices: choices,
      initialInvoiceId: choices[0]?.id,
      onClose: close,
      onSubmit: async (payment) => {
        const paid = await record.mutateAsync({ invoiceId: payment.invoiceId, payment });
        toast.show({ tone: 'success', message: t('pay.success', { invoice: paid.invoiceNo }) });
        close();
      },
    },
  };
}
