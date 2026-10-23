import PropTypes from 'prop-types';
import { useFormik } from 'formik';
import { useTranslation } from 'react-i18next';
import { applyServerErrors, zodValidate } from '@/shared/lib/forms.js';
import { parseMajorToMinor } from '@/shared/lib/money.js';
import Button from '@/shared/ui/Button.jsx';
import CheckboxField from '@/shared/ui/CheckboxField.jsx';
import TextField from '@/shared/ui/TextField.jsx';
import { canAdjustAmount } from '../domain/installment.rules.js';
import { invoiceShape } from '../domain/installment.model.js';
import { createPaymentFormSchema, minorToInput, toPayment } from '../schemas/paymentForm.schema.js';
import AdjustFields from './AdjustFields.jsx';
import ManualFields from './ManualFields.jsx';

const BLANK = {
  method: 'cash',
  reference: '',
  receivedOn: '',
  saveCard: false,
  adjust: false,
  adjustedAmount: '',
  adjustmentReason: '',
};

/**
 * One payment against one invoice: marked received by hand (`manual`), taken on Stripe's embedded
 * card form (`card`) or charged to the customer's saved card (`saved`). `savedCardLabel` names it.
 */
export default function PaymentForm({ invoice, mode, savedCardLabel, onCancel, onSubmit }) {
  const { t } = useTranslation('collections');
  const currency = invoice.balance.currency;
  const card = mode === 'card';
  const saved = mode === 'saved';

  const formik = useFormik({
    initialValues: {
      ...BLANK,
      invoiceId: invoice.id,
      amount: minorToInput(invoice.balance.minor, currency),
    },
    validate: (values) =>
      zodValidate(createPaymentFormSchema({ currency, invoice, mode, t }))(values),
    onSubmit: async (values, helpers) => {
      try {
        await onSubmit({
          payment: toPayment(values, currency),
          saveCard: card && values.saveCard,
        });
        helpers.resetForm();
      } catch (error) {
        if (!applyServerErrors(helpers, error)) {
          helpers.setStatus({ formError: t('pay.failed', { message: error.message }) });
        }
      }
    },
  });

  const err = (name) => (formik.touched[name] ? formik.errors[name] : undefined);
  const field = (name) => ({ ...formik.getFieldProps(name), error: err(name) });
  // When the invoice amount is changed, the amount to pay follows the new balance.
  const followAdjusted = (text) => {
    const next = parseMajorToMinor(text, currency);
    if (next !== null && next > invoice.paid.minor) {
      formik.setFieldValue('amount', minorToInput(next - invoice.paid.minor, currency));
    }
  };

  return (
    <form onSubmit={formik.handleSubmit} noValidate className="grid gap-3 sm:grid-cols-2">
      {formik.status?.formError && (
        <p role="alert" className="text-sm text-danger sm:col-span-2">
          {formik.status.formError}
        </p>
      )}
      <TextField
        label={t('pay.amount', { currency })}
        hint={t('pay.amountHint')}
        inputMode="decimal"
        {...field('amount')}
      />
      {mode === 'manual' && <ManualFields field={field} />}
      {card && (
        <CheckboxField
          className="sm:col-span-2"
          label={t('pay.card.saveCard')}
          checked={formik.values.saveCard}
          onChange={(e) => formik.setFieldValue('saveCard', e.target.checked)}
        />
      )}
      {saved && (
        <p className="rounded-xl bg-surface-muted p-3 text-sm sm:col-span-2">{savedCardLabel}</p>
      )}
      {canAdjustAmount(invoice) && (
        <AdjustFields
          invoice={invoice}
          formik={formik}
          field={field}
          onAdjustedChange={followAdjusted}
        />
      )}
      <div className="mt-3 flex justify-end gap-2 sm:col-span-2">
        <Button variant="secondary" onClick={onCancel} disabled={formik.isSubmitting}>
          {t('pay.cancel')}
        </Button>
        <Button type="submit" loading={formik.isSubmitting}>
          {card ? t('pay.card.submit') : saved ? t('pay.saved.submit') : t('pay.submit')}
        </Button>
      </div>
    </form>
  );
}

PaymentForm.propTypes = {
  invoice: invoiceShape.isRequired,
  mode: PropTypes.oneOf(['manual', 'card', 'saved']).isRequired,
  savedCardLabel: PropTypes.string,
  onCancel: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
};
