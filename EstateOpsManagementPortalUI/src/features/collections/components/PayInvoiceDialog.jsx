import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { useFormik } from 'formik';
import { useTranslation } from 'react-i18next';
import { applyServerErrors, zodValidate } from '@/shared/lib/forms.js';
import { formatMoney } from '@/shared/lib/money.js';
import { useTenant } from '@/shared/lib/tenant.jsx';
import Button from '@/shared/ui/Button.jsx';
import Dialog from '@/shared/ui/Dialog.jsx';
import SelectField from '@/shared/ui/SelectField.jsx';
import TextField from '@/shared/ui/TextField.jsx';
import { PAYMENT_METHODS } from '../domain/installment.constants.js';
import { invoiceShape } from '../domain/installment.model.js';
import { createPaymentFormSchema, minorToInput, toPayment } from '../schemas/paymentForm.schema.js';

/**
 * Take a payment on a customer's behalf (full or part). `invoices` are the payable choices:
 * one invoice from a row action, or all of a customer's unpaid invoices. `onSubmit(payment)`
 * must reject with the server error so field errors can be shown inline.
 */
export default function PayInvoiceDialog({ open, invoices, initialInvoiceId, onClose, onSubmit }) {
  const { t } = useTranslation('collections');
  const { locale } = useTenant();
  const first = invoices.find((i) => i.id === initialInvoiceId) ?? invoices[0];
  const currency = first?.balance.currency ?? 'PKR';

  const formik = useFormik({
    enableReinitialize: true,
    initialValues: {
      invoiceId: first?.id ?? '',
      amount: first ? minorToInput(first.balance.minor, currency) : '',
      method: 'cash',
      reference: '',
    },
    validate: (values) => {
      const selected = invoices.find((i) => i.id === values.invoiceId);
      const schema = createPaymentFormSchema({
        currency,
        balanceMinor: selected?.balance.minor ?? 0,
        t,
      });
      return zodValidate(schema)(values);
    },
    onSubmit: async (values, helpers) => {
      try {
        await onSubmit(toPayment(values, currency));
        helpers.resetForm();
      } catch (error) {
        if (!applyServerErrors(helpers, error)) {
          helpers.setStatus({ formError: t('pay.failed', { message: error.message }) });
        }
      }
    },
  });

  const selected = useMemo(
    () => invoices.find((i) => i.id === formik.values.invoiceId),
    [invoices, formik.values.invoiceId],
  );
  const err = (name) => (formik.touched[name] ? formik.errors[name] : undefined);
  const field = (name) => ({ ...formik.getFieldProps(name), error: err(name) });

  const chooseInvoice = (e) => {
    const next = invoices.find((i) => i.id === e.target.value);
    formik.setFieldValue('invoiceId', e.target.value);
    if (next) formik.setFieldValue('amount', minorToInput(next.balance.minor, currency));
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('pay.title')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={formik.isSubmitting}>
            {t('pay.cancel')}
          </Button>
          <Button type="submit" form="pay-form" loading={formik.isSubmitting}>
            {t('pay.submit')}
          </Button>
        </>
      }
    >
      {selected && (
        <p className="mb-4 rounded-xl bg-primary-soft p-3 text-sm">
          {t('pay.summary', {
            buyer: selected.buyerName,
            invoice: selected.invoiceNo,
            unit: selected.unitNo,
            balance: formatMoney(selected.balance.minor, currency, locale),
          })}
        </p>
      )}
      <form
        id="pay-form"
        onSubmit={formik.handleSubmit}
        noValidate
        className="grid gap-3 sm:grid-cols-2"
      >
        {formik.status?.formError && (
          <p role="alert" className="text-sm text-danger sm:col-span-2">
            {formik.status.formError}
          </p>
        )}
        {invoices.length > 1 && (
          <SelectField
            className="sm:col-span-2"
            label={t('pay.invoice')}
            options={invoices.map((i) => ({
              value: i.id,
              label: t('pay.invoiceOption', {
                invoice: i.invoiceNo,
                unit: i.unitNo,
                balance: formatMoney(i.balance.minor, currency, locale),
              }),
            }))}
            name="invoiceId"
            value={formik.values.invoiceId}
            onChange={chooseInvoice}
            onBlur={formik.handleBlur}
            error={err('invoiceId')}
          />
        )}
        <TextField
          label={t('pay.amount', { currency })}
          hint={t('pay.amountHint')}
          inputMode="decimal"
          {...field('amount')}
        />
        <SelectField
          label={t('pay.method')}
          options={PAYMENT_METHODS.map((value) => ({ value, label: t(`pay.methods.${value}`) }))}
          {...field('method')}
        />
        <TextField className="sm:col-span-2" label={t('pay.reference')} {...field('reference')} />
      </form>
    </Dialog>
  );
}

PayInvoiceDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  invoices: PropTypes.arrayOf(invoiceShape).isRequired,
  initialInvoiceId: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
};
