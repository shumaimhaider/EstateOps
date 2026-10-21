import PropTypes from 'prop-types';
import { useFormik } from 'formik';
import { useTranslation } from 'react-i18next';
import { applyServerErrors, zodValidate } from '@/shared/lib/forms.js';
import { parseMajorToMinor } from '@/shared/lib/money.js';
import Button from '@/shared/ui/Button.jsx';
import TextField from '@/shared/ui/TextField.jsx';
import { canAdjustAmount } from '../domain/installment.rules.js';
import { invoiceShape } from '../domain/installment.model.js';
import {
  createPaymentFormSchema,
  minorToInput,
  toCard,
  toPayment,
} from '../schemas/paymentForm.schema.js';
import AdjustFields from './AdjustFields.jsx';
import CardFields from './CardFields.jsx';
import ManualFields from './ManualFields.jsx';

const BLANK = {
  method: 'cash',
  reference: '',
  receivedOn: '',
  cardNumber: '',
  cardExpiry: '',
  cardCvc: '',
  adjust: false,
  adjustedAmount: '',
  adjustmentReason: '',
};

/** One payment against one invoice: marked received by hand (`manual`) or charged to a card. */
export default function PaymentForm({ invoice, mode, onCancel, onSubmit }) {
  const { t } = useTranslation('collections');
  const currency = invoice.balance.currency;
  const card = mode === 'card';

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
          card: card ? toCard(values) : null,
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
      {card ? <CardFields field={field} /> : <ManualFields field={field} />}
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
          {card ? t('pay.card.submit') : t('pay.submit')}
        </Button>
      </div>
    </form>
  );
}

PaymentForm.propTypes = {
  invoice: invoiceShape.isRequired,
  mode: PropTypes.oneOf(['manual', 'card']).isRequired,
  onCancel: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
};
