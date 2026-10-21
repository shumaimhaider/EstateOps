import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import SelectField from '@/shared/ui/SelectField.jsx';
import TextField from '@/shared/ui/TextField.jsx';
import { PAYMENT_METHODS } from '../domain/installment.constants.js';

/** Fields for a payment received outside the portal (cash, bank transfer, cheque, other online). */
export default function ManualFields({ field }) {
  const { t } = useTranslation('collections');
  return (
    <>
      <SelectField
        label={t('pay.method')}
        options={PAYMENT_METHODS.map((value) => ({ value, label: t(`pay.methods.${value}`) }))}
        {...field('method')}
      />
      <TextField
        label={t('pay.receivedOn')}
        hint={t('pay.receivedOnHint')}
        type="date"
        {...field('receivedOn')}
      />
      <TextField className="sm:col-span-2" label={t('pay.reference')} {...field('reference')} />
    </>
  );
}

ManualFields.propTypes = { field: PropTypes.func.isRequired };
