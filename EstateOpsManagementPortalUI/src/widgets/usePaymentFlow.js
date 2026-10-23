import { createElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { payableInvoices, useRecordPaymentMutation } from '@/features/collections/index.js';
import {
  CheckoutPanel,
  useChargeSavedCardMutation,
  usePaymentMethodsQuery,
  useStartCheckoutMutation,
} from '@/features/payments/index.js';
import { useToast } from '@/shared/ui/toast/toastContext.js';

/**
 * Take a payment on a customer's behalf: marked received by hand, paid on Stripe's embedded card
 * form, or charged to the customer's saved card. `open(invoice)` pays one invoice (row action);
 * `open()` lets the operator choose among all payable invoices (customer-level "Take payment").
 * `customerId` is whose saved card is offered.
 */
export function usePaymentFlow(invoices, { customerId } = {}) {
  const { t } = useTranslation('collections');
  const toast = useToast();
  const record = useRecordPaymentMutation();
  const startCheckout = useStartCheckoutMutation();
  const chargeSaved = useChargeSavedCardMutation();
  const [state, setState] = useState({ open: false, single: null, checkout: null });
  const methods = usePaymentMethodsQuery(customerId, { enabled: state.open });
  const savedCard = methods.data?.find((m) => m.isActive && !m.expired) ?? null;

  const choices = state.single ? [state.single] : payableInvoices(invoices);
  const close = () => setState({ open: false, single: null, checkout: null });

  const submit = async ({ mode, payment, saveCard }) => {
    if (mode === 'card') {
      const checkout = await startCheckout.mutateAsync({
        invoiceId: payment.invoiceId,
        payment,
        saveCard,
      });
      setState((s) => ({ ...s, checkout }));
      return;
    }
    if (mode === 'saved') {
      const tx = await chargeSaved.mutateAsync({ invoiceId: payment.invoiceId, payment });
      const invoice = invoices.find((i) => i.id === payment.invoiceId);
      if (tx.status !== 'succeeded') {
        toast.show({
          tone: 'danger',
          message: t('payments:charge.failed', { message: tx.failureMessage ?? tx.failureCode }),
        });
        return;
      }
      toast.show({
        tone: 'success',
        message: t('payments:charge.success', { invoice: invoice?.invoiceNo ?? '' }),
      });
      close();
      return;
    }
    const paid = await record.mutateAsync({ invoiceId: payment.invoiceId, payment });
    toast.show({ tone: 'success', message: t('pay.success', { invoice: paid.invoiceNo }) });
    close();
  };

  return {
    payable: payableInvoices(invoices),
    open: (invoice = null) => setState({ open: true, single: invoice, checkout: null }),
    dialogProps: {
      open: state.open && choices.length > 0,
      invoices: choices,
      initialInvoiceId: choices[0]?.id,
      savedCard,
      checkout: state.checkout,
      renderCheckout: (checkout) =>
        createElement(CheckoutPanel, {
          key: checkout.checkoutId,
          checkout,
          onCancel: close,
          onFinished: close,
        }),
      onClose: close,
      onSubmit: submit,
    },
  };
}
