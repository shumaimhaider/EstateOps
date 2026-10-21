import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '@/shared/lib/money.js';
import { useTenant } from '@/shared/lib/tenant.jsx';
import CheckboxField from '@/shared/ui/CheckboxField.jsx';
import TextField from '@/shared/ui/TextField.jsx';
import { invoiceShape } from '../domain/installment.model.js';

/** "Adjust the invoice amount" option of the payment form (only when the role may adjust). */
export default function AdjustFields({ invoice, formik, field, onAdjustedChange }) {
  const { t } = useTranslation('collections');
  const { locale } = useTenant();
  const currency = invoice.amount.currency;
  return (
    <div className="space-y-3 sm:col-span-2">
      <CheckboxField
        label={t('pay.adjust.toggle')}
        name="adjust"
        checked={formik.values.adjust}
        onChange={formik.handleChange}
      />
      {formik.values.adjust && (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label={t('pay.adjust.newAmount', { currency })}
            hint={t('pay.adjust.hint', {
              amount: formatMoney(invoice.amount.minor, currency, locale),
              paid: formatMoney(invoice.paid.minor, currency, locale),
            })}
            inputMode="decimal"
            {...field('adjustedAmount')}
            onChange={(e) => {
              formik.handleChange(e);
              onAdjustedChange(e.target.value);
            }}
          />
          <TextField label={t('pay.adjust.reason')} {...field('adjustmentReason')} />
        </div>
      )}
    </div>
  );
}

AdjustFields.propTypes = {
  invoice: invoiceShape.isRequired,
  formik: PropTypes.object.isRequired,
  field: PropTypes.func.isRequired,
  onAdjustedChange: PropTypes.func.isRequired,
};
